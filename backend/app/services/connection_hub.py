"""WebSocket connection hub and event broadcaster."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import WebSocket

from app.agents.events import EventBroadcaster

logger = logging.getLogger(__name__)


class ConnectionHub(EventBroadcaster):
    """Manage active websocket connections by session id."""

    def __init__(self) -> None:
        self._active: dict[str, list[WebSocket]] = {}

    async def connect(self, session_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._active.setdefault(session_id, []).append(websocket)
        logger.info(
            "WS connected: session=%s (total=%d)",
            session_id,
            len(self._active[session_id]),
        )

    def disconnect(self, session_id: str, websocket: WebSocket) -> None:
        connections = self._active.get(session_id, [])
        if websocket in connections:
            connections.remove(websocket)
        if not connections:
            self._active.pop(session_id, None)
        logger.info("WS disconnected: session=%s", session_id)

    async def send(self, session_id: str, websocket: WebSocket, message: dict[str, Any]) -> None:
        try:
            await websocket.send_json(message)
        except Exception as exc:
            logger.warning("Failed to send WS message for %s: %s", session_id, exc)

    async def broadcast(self, session_id: str, message: dict[str, Any]) -> None:
        dead: list[WebSocket] = []
        for websocket in self._active.get(session_id, []):
            try:
                await websocket.send_json(message)
            except Exception:
                dead.append(websocket)

        for websocket in dead:
            self.disconnect(session_id, websocket)

    def get_connections(self, session_id: str) -> list[WebSocket]:
        return self._active.get(session_id, [])

    @property
    def active_sessions(self) -> list[str]:
        return list(self._active.keys())
