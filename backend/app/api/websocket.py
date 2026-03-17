"""
WebSocket endpoint for real-time debate streaming.
"""

from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])

_debate_tasks: dict[str, asyncio.Task] = {}


class ConnectionManager:
    """Manage active WebSocket connections grouped by session id."""

    def __init__(self) -> None:
        self._active: dict[str, list[WebSocket]] = {}

    async def connect(self, session_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._active.setdefault(session_id, []).append(websocket)
        logger.info("WS connected: session=%s (total=%d)", session_id, len(self._active[session_id]))

    def disconnect(self, session_id: str, websocket: WebSocket) -> None:
        conns = self._active.get(session_id, [])
        if websocket in conns:
            conns.remove(websocket)
        if not conns:
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


manager = ConnectionManager()

_SESSION_ID_RE = re.compile(r"^[0-9a-f]{12}$")
_VALID_ACTIONS = {"start", "stop", "ping", "intervene"}


@router.websocket("/ws/{session_id}")
async def debate_ws(websocket: WebSocket, session_id: str):
    """
    Connect to a debate session and stream debate events in real time.
    """
    if not _SESSION_ID_RE.match(session_id):
        await websocket.accept()
        await websocket.close(code=4001, reason="Invalid session_id format")
        return

    await manager.connect(session_id, websocket)

    try:
        await manager.send(
            session_id,
            websocket,
            {"type": "system", "content": f"Connected to session {session_id}"},
        )

        while True:
            try:
                data = await websocket.receive_json()
            except WebSocketDisconnect:
                raise
            except Exception:
                await manager.send(
                    session_id,
                    websocket,
                    {"type": "error", "content": "Invalid JSON message."},
                )
                continue

            action = data.get("action") if isinstance(data, dict) else None
            if action not in _VALID_ACTIONS:
                await manager.send(
                    session_id,
                    websocket,
                    {"type": "error", "content": f"Unknown or missing action: {action}"},
                )
                continue

            if action == "start":
                if session_id in _debate_tasks and not _debate_tasks[session_id].done():
                    await manager.send(
                        session_id,
                        websocket,
                        {"type": "error", "content": "This session is already running."},
                    )
                    continue

                from app.db.database import get_session_factory
                from app.services import session_service

                async with get_session_factory()() as db:
                    session_db = await session_service.get_session(db, session_id)

                if not session_db:
                    await manager.send(
                        session_id,
                        websocket,
                        {"type": "error", "content": f"Session {session_id} was not found."},
                    )
                    continue

                from app.agents.runner import run_debate

                task = asyncio.create_task(
                    run_debate(
                        session_id=session_id,
                        topic=session_db.get("topic", ""),
                        participants=session_db.get("participants", ["proposer", "opposer"]),
                        max_turns=session_db.get("max_turns", 5),
                        agent_configs=session_db.get("agent_configs", {}),
                    )
                )
                _debate_tasks[session_id] = task
                task.add_done_callback(lambda _task, sid=session_id: _debate_tasks.pop(sid, None))
                logger.info(
                    "Debate task launched for session %s with runtime configs %s",
                    session_id,
                    list(session_db.get("agent_configs", {}).keys()),
                )

            elif action == "stop":
                task = _debate_tasks.get(session_id)
                if task and not task.done():
                    task.cancel()
                    logger.info("Debate task cancelled for session %s", session_id)
                await manager.broadcast(
                    session_id,
                    {"type": "system", "content": "Debate stopped by user."},
                )

            elif action == "ping":
                await manager.send(session_id, websocket, {"type": "pong"})

            elif action == "intervene":
                content = data.get("content", "").strip()
                if not content:
                    continue

                from app.dependencies import get_intervention_manager

                intervention_manager = get_intervention_manager()
                await intervention_manager.add_intervention(session_id, content)

                task = _debate_tasks.get(session_id)
                if task and not task.done():
                    await manager.broadcast(
                        session_id,
                        {
                            "type": "audience_message",
                            "content": content,
                            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
                        },
                    )
                else:
                    await manager.send(
                        session_id,
                        websocket,
                        {
                            "type": "system",
                            "content": "Intervention queued for the next round.",
                        },
                    )

    except WebSocketDisconnect:
        manager.disconnect(session_id, websocket)
    except Exception as exc:
        logger.error("WebSocket error for session %s: %s", session_id, exc)
        manager.disconnect(session_id, websocket)
