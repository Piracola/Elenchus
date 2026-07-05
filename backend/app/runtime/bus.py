"""Unified runtime bus for event sequencing, persistence, and delivery."""

from __future__ import annotations

import asyncio
import logging
from collections import deque
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi.encoders import jsonable_encoder
from fastapi import WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from app.runtime.event_schema import RuntimeEvent, build_runtime_event
from app.runtime.event_persistence import should_persist_runtime_event

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
        self._seq_by_run: dict[str, int] = {}
        self._active: dict[str, list[WebSocket]] = {}
        self._run_locks: dict[str, asyncio.Lock] = {}
        self._pending_connections: dict[str, dict[WebSocket, deque[dict[str, Any]]]] = {}

    async def connect(self, run_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._active.setdefault(run_id, []).append(websocket)
        logger.info(
            "WS connected: run=%s (total=%d)",
            run_id,
            len(self._active[run_id]),
        )

    async def snapshot_latest_sequence(self, run_id: str) -> int:
        async with self._get_run_lock(run_id):
            return await self._load_latest_sequence_locked(run_id)

    async def register_pending_listener(
        self,
        run_id: str,
        websocket: WebSocket,
        *,
        accept: bool = True,
    ) -> None:
        if accept:
            await websocket.accept()
        async with self._get_run_lock(run_id):
            self._pending_connections.setdefault(run_id, {})[websocket] = deque()
            pending_count = len(self._pending_connections[run_id])
        logger.info("WS catch-up connected: run=%s (pending=%d)", run_id, pending_count)

    async def activate_pending_listener(
        self,
        run_id: str,
        websocket: WebSocket,
        *,
        replay_until_seq: int,
    ) -> list[dict[str, Any]]:
        async with self._get_run_lock(run_id):
            pending_for_run = self._pending_connections.get(run_id, {})
            buffered = pending_for_run.pop(websocket, deque())
            if not pending_for_run:
                self._pending_connections.pop(run_id, None)
            self._active.setdefault(run_id, []).append(websocket)
            active_count = len(self._active[run_id])
        logger.info("WS catch-up completed: run=%s (active=%d)", run_id, active_count)
        return [
            dict(item)
            for item in buffered
            if int(item.get("seq", -1) or -1) > replay_until_seq
        ]

    def disconnect(self, run_id: str, websocket: WebSocket) -> None:
        connections = self._active.get(run_id)
        removed = False
        if connections and websocket in connections:
            connections.remove(websocket)
            removed = True
        if connections == []:
            self._active.pop(run_id, None)
        pending_for_run = self._pending_connections.get(run_id)
        if pending_for_run and websocket in pending_for_run:
            pending_for_run.pop(websocket, None)
            removed = True
            if not pending_for_run:
                self._pending_connections.pop(run_id, None)
        if not self._active.get(run_id) and not self._pending_connections.get(run_id):
            self._run_locks.pop(run_id, None)
        if removed:
            logger.info("WS disconnected: run=%s", run_id)

    async def send(
        self,
        run_id: str,
        websocket: WebSocket,
        message: dict[str, Any],
    ) -> bool:
        if self._is_closed(websocket):
            self.disconnect(run_id, websocket)
            return False

        try:
            await websocket.send_json(jsonable_encoder(message))
            return True
        except Exception as exc:
            self.disconnect(run_id, websocket)
            if self._is_expected_disconnect_error(exc):
                logger.debug(
                    "Skipping WS message for disconnected run %s: %s",
                    run_id,
                    exc,
                )
            else:
                logger.warning("Failed to send WS message for run %s: %s", run_id, exc)
            return False

    async def broadcast(self, run_id: str, message: dict[str, Any]) -> None:
        """Broadcast message to all active WebSocket connections in parallel."""
        websockets = list(self._active.get(run_id, []))
        if not websockets:
            return
        results = await asyncio.gather(
            *[self.send(run_id, ws, message) for ws in websockets],
            return_exceptions=True,
        )
        for result in results:
            if isinstance(result, Exception):
                logger.warning(
                    "Broadcast send error for run %s: %s", run_id, result
                )

    def get_connections(self, run_id: str) -> list[WebSocket]:
        return self._active.get(run_id, [])

    @property
    def active_runs(self) -> list[str]:
        return list(self._active.keys())

    @property
    def active_sessions(self) -> list[str]:
        return self.active_runs

    async def create_event(
        self,
        *,
        run_id: str,
        session_id: str,
        event_type: str,
        payload: dict[str, Any] | None = None,
        source: str = "runtime",
        phase: str | None = None,
        persisted: bool = True,
    ) -> RuntimeEvent:
        if persisted:
            seq = await self._next_sequence(run_id)
        else:
            seq = -1
        return build_runtime_event(
            run_id=run_id,
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
        run_id: str,
        session_id: str,
        event_type: str,
        payload: dict[str, Any] | None = None,
        source: str = "runtime",
        phase: str | None = None,
    ) -> RuntimeEvent:
        persisted = should_persist_runtime_event(
            event_type,
            payload,
            source=source,
        )
        event = await self.create_event(
            run_id=run_id,
            session_id=session_id,
            event_type=event_type,
            payload=payload,
            source=source,
            phase=phase,
            persisted=persisted,
        )
        if self._repository is not None and persisted:
            persisted_event = await self._repository.persist_runtime_event(event)
            if isinstance(persisted_event, dict):
                event = persisted_event
                self._seq_by_run[run_id] = max(
                    self._seq_by_run.get(run_id, 0),
                    int(event.get("seq", 0) or 0),
                )
        await self._deliver(run_id, event)
        return event

    async def _deliver(self, run_id: str, event: RuntimeEvent) -> None:
        async with self._get_run_lock(run_id):
            pending_for_run = self._pending_connections.get(run_id)
            if pending_for_run:
                for queue in pending_for_run.values():
                    queue.append(dict(event))
        if self._sink is not None:
            await self._sink(run_id, event)
            return
        await self.broadcast(run_id, event)

    def _get_run_lock(self, run_id: str) -> asyncio.Lock:
        """Get or create a per-run lock to keep event sequence stable."""
        if run_id not in self._run_locks:
            self._run_locks[run_id] = asyncio.Lock()
        return self._run_locks[run_id]

    async def _next_sequence(self, run_id: str) -> int:
        async with self._get_run_lock(run_id):
            latest_seq = await self._load_latest_sequence_locked(run_id, refresh=True)
            current = max(self._seq_by_run.get(run_id, 0), latest_seq) + 1
            self._seq_by_run[run_id] = current
            return current

    async def _load_latest_sequence_locked(self, run_id: str, *, refresh: bool = False) -> int:
        if (refresh or run_id not in self._seq_by_run) and self._repository is not None:
            latest_seq = await self._repository.get_latest_runtime_event_seq(run_id)
            self._seq_by_run[run_id] = max(self._seq_by_run.get(run_id, 0), latest_seq)
        return self._seq_by_run.get(run_id, 0)

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
