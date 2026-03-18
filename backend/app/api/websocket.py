"""WebSocket endpoint for real-time debate streaming."""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.dependencies import (
    get_connection_hub,
    get_debate_runtime_service,
    get_event_stream_gateway,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])

_SESSION_ID_RE = re.compile(r"^[0-9a-f]{12}$")
_VALID_ACTIONS = {"start", "stop", "ping", "intervene"}


@router.websocket("/ws/{session_id}")
async def debate_ws(websocket: WebSocket, session_id: str):
    """Connect to a debate session and stream debate events in real time."""
    connection_hub = get_connection_hub()
    runtime_service = get_debate_runtime_service()
    event_gateway = get_event_stream_gateway()

    if not _SESSION_ID_RE.match(session_id):
        await websocket.accept()
        await websocket.close(code=4001, reason="Invalid session_id format")
        return

    await connection_hub.connect(session_id, websocket)

    try:
        connected_event = await event_gateway.create_event(
            session_id=session_id,
            event_type="system",
            payload={"content": f"Connected to session {session_id}"},
            source="ws.gateway",
        )
        await connection_hub.send(session_id, websocket, connected_event)

        while True:
            try:
                data = await websocket.receive_json()
            except WebSocketDisconnect:
                raise
            except Exception:
                invalid_json_event = await event_gateway.create_event(
                    session_id=session_id,
                    event_type="error",
                    payload={"content": "Invalid JSON message."},
                    source="ws.gateway",
                    phase="error",
                )
                await connection_hub.send(session_id, websocket, invalid_json_event)
                continue

            action = data.get("action") if isinstance(data, dict) else None
            if action not in _VALID_ACTIONS:
                invalid_action_event = await event_gateway.create_event(
                    session_id=session_id,
                    event_type="error",
                    payload={"content": f"Unknown or missing action: {action}"},
                    source="ws.gateway",
                    phase="error",
                )
                await connection_hub.send(session_id, websocket, invalid_action_event)
                continue

            if action == "start":
                result = await runtime_service.start_session(session_id)
                if not result.started:
                    start_failed_event = await event_gateway.create_event(
                        session_id=session_id,
                        event_type="error",
                        payload={"content": result.message or "Failed to start session."},
                        source="ws.gateway",
                        phase="error",
                    )
                    await connection_hub.send(session_id, websocket, start_failed_event)
                    continue

                session_db = result.session or {}
                logger.info(
                    "Debate task launched for session %s with runtime configs %s",
                    session_id,
                    list(session_db.get("agent_configs", {}).keys()),
                )

            elif action == "stop":
                stopped = await runtime_service.stop_session(session_id)
                if stopped:
                    logger.info("Debate task cancelled for session %s", session_id)
                await event_gateway.emit(
                    session_id=session_id,
                    event_type="system",
                    payload={"content": "Debate stopped by user."},
                    source="ws.gateway",
                )

            elif action == "ping":
                pong_event = await event_gateway.create_event(
                    session_id=session_id,
                    event_type="pong",
                    payload={},
                    source="ws.gateway",
                )
                await connection_hub.send(session_id, websocket, pong_event)

            elif action == "intervene":
                content = data.get("content", "").strip()
                if not content:
                    continue

                is_running = await runtime_service.queue_intervention(session_id, content)
                if is_running:
                    await event_gateway.emit(
                        session_id=session_id,
                        event_type="audience_message",
                        payload={
                            "content": content,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        },
                        source="ws.gateway",
                    )
                else:
                    queued_event = await event_gateway.create_event(
                        session_id=session_id,
                        event_type="system",
                        payload={"content": "Intervention queued for the next round."},
                        source="ws.gateway",
                    )
                    await connection_hub.send(session_id, websocket, queued_event)

    except WebSocketDisconnect:
        connection_hub.disconnect(session_id, websocket)
    except Exception as exc:
        logger.error("WebSocket error for session %s: %s", session_id, exc)
        connection_hub.disconnect(session_id, websocket)
