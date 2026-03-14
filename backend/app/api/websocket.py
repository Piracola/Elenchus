"""
WebSocket endpoint for real-time debate streaming.

Protocol (Server → Client messages):
  { "type": "system",            "content": "..." }
  { "type": "status",            "content": "...", "phase": "..." }
  { "type": "speech_start",      "role": "proposer" }
  { "type": "speech_token",      "role": "proposer", "token": "..." }
  { "type": "speech_end",        "role": "proposer", "content": "full text" }
  { "type": "fact_check_start",  "claims": [...] }
  { "type": "fact_check_result", "results": [...] }
  { "type": "judge_start" }
  { "type": "judge_score",       "role": "proposer", "scores": {...} }
  { "type": "turn_complete",     "turn": 3, "scores": {...} }
  { "type": "debate_complete",   "final_scores": {...} }
  { "type": "error",             "content": "..." }
  { "type": "pong" }

Protocol (Client → Server messages):
  { "action": "start" }          — Begin the debate
  { "action": "ping" }           — Keep-alive
  { "action": "stop" }           — Abort the debate
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])

# Track running debate tasks so they can be cancelled
_debate_tasks: dict[str, asyncio.Task] = {}


# ── Connection Manager ───────────────────────────────────────────

class ConnectionManager:
    """
    Manages active WebSocket connections grouped by session_id.
    Supports multiple viewers per session (spectator mode).
    """

    def __init__(self) -> None:
        self._active: dict[str, list[WebSocket]] = {}

    async def connect(self, session_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._active.setdefault(session_id, []).append(websocket)
        logger.info("WS connected: session=%s  (total=%d)", session_id, len(self._active[session_id]))

    def disconnect(self, session_id: str, websocket: WebSocket) -> None:
        conns = self._active.get(session_id, [])
        if websocket in conns:
            conns.remove(websocket)
        if not conns:
            self._active.pop(session_id, None)
        logger.info("WS disconnected: session=%s", session_id)

    async def send(self, session_id: str, websocket: WebSocket, message: dict[str, Any]) -> None:
        """Send a message to a specific client."""
        try:
            await websocket.send_json(message)
        except Exception as exc:
            logger.warning("Failed to send WS message: %s", exc)

    async def broadcast(self, session_id: str, message: dict[str, Any]) -> None:
        """Broadcast a message to ALL clients watching a session."""
        dead: list[WebSocket] = []
        for ws in self._active.get(session_id, []):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        # Clean up broken connections
        for ws in dead:
            self.disconnect(session_id, ws)

    def get_connections(self, session_id: str) -> list[WebSocket]:
        return self._active.get(session_id, [])

    @property
    def active_sessions(self) -> list[str]:
        return list(self._active.keys())


# Singleton instance — shared with the debate runner
manager = ConnectionManager()


# ── WebSocket Endpoint ───────────────────────────────────────────

# Validate session_id format (hex string, 12 chars — matches _gen_id output)
_SESSION_ID_RE = re.compile(r"^[0-9a-f]{12}$")
_VALID_ACTIONS = {"start", "stop", "ping", "intervene"}


@router.websocket("/ws/{session_id}")
async def debate_ws(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for a debate session.
    After connection, the client sends action messages to control the debate.
    The server streams events back in real-time.
    """
    # Validate session_id format before accepting
    if not _SESSION_ID_RE.match(session_id):
        # Must accept before we can send a close frame
        await websocket.accept()
        await websocket.close(code=4001, reason="Invalid session_id format")
        return

    await manager.connect(session_id, websocket)

    try:
        # Notify client of successful connection
        await manager.send(session_id, websocket, {
            "type": "system",
            "content": f"Connected to session {session_id}",
        })

        while True:
            # Wrap receive_json in try/except for malformed JSON only.
            # WebSocketDisconnect must be re-raised so the outer handler can clean up.
            try:
                data = await websocket.receive_json()
            except WebSocketDisconnect:
                raise
            except Exception:
                await manager.send(session_id, websocket, {
                    "type": "error",
                    "content": "无效的 JSON 消息格式。",
                })
                continue

            action = data.get("action") if isinstance(data, dict) else None
            if not action or action not in _VALID_ACTIONS:
                await manager.send(session_id, websocket, {
                    "type": "error",
                    "content": f"Unknown or missing action: {action}",
                })
                continue

            if action == "start":
                # Check if debate is already running for this session
                if session_id in _debate_tasks and not _debate_tasks[session_id].done():
                    await manager.send(session_id, websocket, {
                        "type": "error",
                        "content": "该 Session 的辩论已在进行中。",
                    })
                    continue

                # Fetch session info securely from database
                from app.services import session_service
                from app.db.database import get_session_factory
                factory = get_session_factory()
                
                async with factory() as db:
                    session_db = await session_service.get_session(db, session_id)
                    
                if not session_db:
                    await manager.send(session_id, websocket, {
                        "type": "error",
                        "content": f"Session {session_id} 不存在。",
                    })
                    continue

                topic = session_db.get("topic", "")
                max_turns = session_db.get("max_turns", 5)
                participants = session_db.get("participants", ["proposer", "opposer"])
                agent_configs = session_db.get("agent_configs", {})

                # Launch debate as background task
                from app.agents.runner import run_debate
                task = asyncio.create_task(
                    run_debate(
                        session_id=session_id,
                        topic=topic,
                        participants=participants,
                        max_turns=max_turns,
                        agent_configs=agent_configs,
                    )
                )
                _debate_tasks[session_id] = task
                # Clean up finished tasks to prevent memory leaks
                task.add_done_callback(lambda t, sid=session_id: _debate_tasks.pop(sid, None))
                logger.info("Debate task launched for session %s with runtime configs %s", session_id, list(agent_configs.keys()))

            elif action == "stop":
                # Cancel running debate
                task = _debate_tasks.get(session_id)
                if task and not task.done():
                    task.cancel()
                    logger.info("Debate task cancelled for session %s", session_id)
                await manager.broadcast(session_id, {
                    "type": "system",
                    "content": "辩论已被用户终止。",
                })

            elif action == "ping":
                await manager.send(session_id, websocket, {"type": "pong"})

            elif action == "intervene":
                content = data.get("content", "").strip()
                if content:
                    from app.services.intervention_manager import get_intervention_manager
                    intervention_mgr = get_intervention_manager()
                    await intervention_mgr.add_intervention(session_id, content)
                    task = _debate_tasks.get(session_id)
                    if task and task.done():
                        from datetime import datetime, timezone
                        await manager.broadcast(session_id, {
                            "type": "audience_message",
                            "content": content,
                            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
                        })
                    else:
                        await manager.send(session_id, websocket, {
                            "type": "system",
                            "content": f"介入消息已加入队列，将在下一回合开始时注入。",
                        })

    except WebSocketDisconnect:
        manager.disconnect(session_id, websocket)
    except Exception as exc:
        logger.error("WebSocket error for session %s: %s", session_id, exc)
        manager.disconnect(session_id, websocket)
