"""WebSocket endpoint for real-time run event streaming."""

from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.dependencies import get_debate_runtime_service, get_runtime_bus
from app.services.run_service import get_run, list_run_events

if TYPE_CHECKING:
    from app.runtime.bus import RuntimeBus

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])

_ID_RE = re.compile(r"^[0-9a-f]{12}$")


async def _send_error_event(
    *,
    runtime_bus: RuntimeBus,
    run_id: str,
    session_id: str,
    websocket: WebSocket,
    content: str,
) -> bool:
    event = await runtime_bus.create_event(
        run_id=run_id,
        session_id=session_id,
        event_type="error",
        payload={"content": content},
        source="ws.gateway",
        phase="error",
        persisted=False,
    )
    return await runtime_bus.send(run_id, websocket, event)


@router.websocket("/ws/runs/{run_id}")
async def run_ws(websocket: WebSocket, run_id: str, after_seq: int = Query(default=0, ge=0)):
    """Subscribe to one run's persisted event stream and live events."""
    runtime_bus = get_runtime_bus()
    runtime_service = get_debate_runtime_service()

    if not _ID_RE.match(run_id):
        await websocket.accept()
        await websocket.close(code=4001, reason="Invalid run_id format")
        return

    run_record = await get_run(run_id)
    if run_record is None:
        await websocket.accept()
        await websocket.close(code=4004, reason="Run not found")
        return

    await runtime_service.reconcile_run_liveness(run_id)
    run_record = await get_run(run_id)
    if run_record is None:
        await websocket.accept()
        await websocket.close(code=4004, reason="Run not found")
        return

    session_id = run_record.session_id
    await websocket.accept()
    await runtime_bus.register_pending_listener(run_id, websocket, accept=False)

    try:
        replay_until_seq = await runtime_bus.snapshot_latest_sequence(run_id)
        for event in await list_run_events(run_id, after_seq=after_seq, up_to_seq=replay_until_seq):
            if not await runtime_bus.send(run_id, websocket, event):
                return

        pending_events = await runtime_bus.activate_pending_listener(
            run_id,
            websocket,
            replay_until_seq=replay_until_seq,
        )
        for event in pending_events:
            if not await runtime_bus.send(run_id, websocket, event):
                return

        connected_event = await runtime_bus.create_event(
            run_id=run_id,
            session_id=session_id,
            event_type="system",
            payload={"content": f"Connected to run {run_id}"},
            source="ws.gateway",
            persisted=False,
        )
        if not await runtime_bus.send(run_id, websocket, connected_event):
            return

        if runtime_service.is_running(run_id):
            resumed_event = await runtime_bus.create_event(
                run_id=run_id,
                session_id=session_id,
                event_type="status",
                payload={"content": "Live run is currently running.", "node": ""},
                source="ws.gateway",
                phase="processing",
                persisted=False,
            )
            if not await runtime_bus.send(run_id, websocket, resumed_event):
                return

        while True:
            try:
                data = await websocket.receive_json()
            except WebSocketDisconnect:
                break
            except Exception:
                if not await _send_error_event(
                    runtime_bus=runtime_bus,
                    run_id=run_id,
                    session_id=session_id,
                    websocket=websocket,
                    content="Invalid JSON message.",
                ):
                    return
                continue

            action = data.get("action") if isinstance(data, dict) else None
            if action == "ping":
                pong_event = await runtime_bus.create_event(
                    run_id=run_id,
                    session_id=session_id,
                    event_type="pong",
                    payload={},
                    source="ws.gateway",
                    persisted=False,
                )
                if not await runtime_bus.send(run_id, websocket, pong_event):
                    return
                continue

            if not await _send_error_event(
                runtime_bus=runtime_bus,
                run_id=run_id,
                session_id=session_id,
                websocket=websocket,
                content=f"Unsupported websocket action: {action}",
            ):
                return
    except Exception as exc:
        logger.error("WebSocket error for run %s: %s", run_id, exc)
    finally:
        runtime_bus.disconnect(run_id, websocket)
