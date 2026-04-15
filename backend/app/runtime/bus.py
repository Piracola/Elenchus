"""Unified runtime bus for event sequencing, persistence, and delivery."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from app.runtime.event_schema import RuntimeEvent, build_runtime_event

logger = logging.getLogger(__name__)

EventSink = Callable[[str, dict[str, Any]], Awaitable[None]]


class RuntimeBus:
    """Own runtime event delivery and websocket fan-out in one place."""

    def __init__(
        self,
        sink: EventSink | None = None,
        *,
        repository: Any | None = None,
    ) -> None:
        self._sink = sink
        self._repository = repository
        self._seq_by_session: dict[str, int] = {}
        self._active: dict[str, list[WebSocket]] = {}
        self._lock = asyncio.Lock()
        # Per-session locks for sequence number generation to reduce contention
        self._session_locks: dict[str, asyncio.Lock] = {}

    async def connect(self, session_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._active.setdefault(session_id, []).append(websocket)
        logger.info(
            "WS connected: session=%s (total=%d)",
            session_id,
            len(self._active[session_id]),
        )

    def disconnect(self, session_id: str, websocket: WebSocket) -> None:
        connections = self._active.get(session_id)
        if not connections:
            return

        removed = False
        if websocket in connections:
            connections.remove(websocket)
            removed = True
        if not connections:
            self._active.pop(session_id, None)
            # Clean up per-session lock when no connections remain
            self._session_locks.pop(session_id, None)
        if removed:
            logger.info("WS disconnected: session=%s", session_id)

    async def send(
        self,
        session_id: str,
        websocket: WebSocket,
        message: dict[str, Any],
    ) -> bool:
        if self._is_closed(websocket):
            self.disconnect(session_id, websocket)
            return False

        try:
            await websocket.send_json(message)
            return True
        except Exception as exc:
            self.disconnect(session_id, websocket)
            if self._is_expected_disconnect_error(exc):
                logger.debug(
                    "Skipping WS message for disconnected session %s: %s",
                    session_id,
                    exc,
                )
            else:
                logger.warning("Failed to send WS message for %s: %s", session_id, exc)
            return False

    async def broadcast(self, session_id: str, message: dict[str, Any]) -> None:
        """Broadcast message to all active WebSocket connections in parallel."""
        websockets = list(self._active.get(session_id, []))
        if not websockets:
            return
        results = await asyncio.gather(
            *[self.send(session_id, ws, message) for ws in websockets],
            return_exceptions=True,
        )
        for result in results:
            if isinstance(result, Exception):
                logger.warning(
                    "Broadcast send error for session %s: %s", session_id, result
                )

    def get_connections(self, session_id: str) -> list[WebSocket]:
        return self._active.get(session_id, [])

    @property
    def active_sessions(self) -> list[str]:
        return list(self._active.keys())

    async def create_event(
        self,
        *,
        session_id: str,
        event_type: str,
        payload: dict[str, Any] | None = None,
        source: str = "runtime",
        phase: str | None = None,
    ) -> RuntimeEvent:
        seq = await self._next_sequence(session_id)
        return build_runtime_event(
            session_id=session_id,
            seq=seq,
            event_type=event_type,
            payload=payload,
            source=source,
            phase=phase,
        )

    async def emit(
        self,
        *,
        session_id: str,
        event_type: str,
        payload: dict[str, Any] | None = None,
        source: str = "runtime",
        phase: str | None = None,
    ) -> RuntimeEvent:
        event = await self.create_event(
            session_id=session_id,
            event_type=event_type,
            payload=payload,
            source=source,
            phase=phase,
        )
        # Skip persistence for high-frequency events (speech_token, heartbeat)
        # to avoid database write bottleneck during streaming
        if self._repository is not None and event_type not in ("speech_token",):
            await self._repository.persist_runtime_event(event)
        await self._deliver(session_id, event)
        return event

    async def _deliver(self, session_id: str, event: RuntimeEvent) -> None:
        if self._sink is not None:
            await self._sink(session_id, event)
            return
        await self.broadcast(session_id, event)

    def _get_session_lock(self, session_id: str) -> asyncio.Lock:
        """Get or create a per-session lock to reduce contention."""
        if session_id not in self._session_locks:
            self._session_locks[session_id] = asyncio.Lock()
        return self._session_locks[session_id]

    async def _next_sequence(self, session_id: str) -> int:
        async with self._get_session_lock(session_id):
            if session_id not in self._seq_by_session and self._repository is not None:
                latest_seq = await self._repository.get_latest_runtime_event_seq(session_id)
                self._seq_by_session[session_id] = latest_seq
            current = self._seq_by_session.get(session_id, 0) + 1
            self._seq_by_session[session_id] = current
            return current

    @staticmethod
    def _is_closed(websocket: WebSocket) -> bool:
        return (
            getattr(websocket, "application_state", None) == WebSocketState.DISCONNECTED
            or getattr(websocket, "client_state", None) == WebSocketState.DISCONNECTED
        )

    @staticmethod
    def _is_expected_disconnect_error(exc: Exception) -> bool:
        if isinstance(exc, WebSocketDisconnect):
            return True
        if not isinstance(exc, RuntimeError):
            return False
        return str(exc) == 'Cannot call "send" once a close message has been sent.'
