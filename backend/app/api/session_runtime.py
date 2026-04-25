from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel

from app.audit import log_audit
from app.dependencies import get_debate_runtime_service
from app.middleware.auth import require_auth
from app.models.schemas import RuntimeEventPageResponse
from app.runtime.service import DebateRuntimeService
from app.services import export_service, runtime_event_service, session_service

router = APIRouter(tags=["sessions"])


class StartDebateRequest(BaseModel):
    """Request body for starting a debate session via REST API."""

    topic: str | None = None
    participants: list[str] | None = None
    max_turns: int | None = None


class StartDebateResponse(BaseModel):
    """Response for starting a debate session via REST API."""

    started: bool
    message: str | None = None
    session_id: str


@router.post("/sessions/{session_id}/start", response_model=StartDebateResponse)
async def start_debate_session(
    session_id: str,
    body: StartDebateRequest | None = None,
    runtime_service: DebateRuntimeService = Depends(get_debate_runtime_service),
):
    """
    Start a debate session via REST API.

    This endpoint provides a synchronous way to start a debate and returns
    detailed error information, complementing the WebSocket-based start action.
    Real-time events are still delivered via WebSocket.
    """
    # Update session parameters if provided — use update_session_state
    # which persists state_snapshot fields; for top-level fields like
    # topic/participants/max_turns we update via the existing session data
    if body:
        session_data = await session_service.get_session(session_id)
        if session_data is None:
            raise HTTPException(status_code=404, detail="Session not found")

        # Apply overrides to the session data for the runtime invocation
        if body.topic is not None:
            session_data["topic"] = body.topic
        if body.participants is not None:
            session_data["participants"] = body.participants
        if body.max_turns is not None:
            session_data["max_turns"] = body.max_turns

    result = await runtime_service.start_session(session_id)

    if not result.started:
        # Return 409 Conflict if already running, 422 for other failures
        status_code = 409 if "already running" in (result.message or "") else 422
        raise HTTPException(status_code=status_code, detail=result.message)

    log_audit("session_start", session_id=session_id)
    return StartDebateResponse(
        started=True,
        session_id=session_id,
    )


@router.post("/sessions/{session_id}/stop")
async def stop_debate_session(
    session_id: str,
    runtime_service: DebateRuntimeService = Depends(get_debate_runtime_service),
):
    """Stop a running debate session via REST API."""
    stopped = await runtime_service.stop_session(session_id)
    if not stopped:
        raise HTTPException(status_code=404, detail="No running debate found for this session")
    return {"stopped": True, "session_id": session_id}


@router.get("/sessions/{session_id}/runtime-events", response_model=RuntimeEventPageResponse)
async def list_runtime_events(
    session_id: str,
    before_seq: int | None = Query(default=None, ge=1),
    limit: int = Query(default=200, ge=1, le=1000),
):
    session_record = await session_service.get_session_record(session_id)
    if session_record is None:
        raise HTTPException(status_code=404, detail="Session not found")

    data = await runtime_event_service.list_runtime_events(
        session_id,
        before_seq=before_seq,
        limit=limit,
    )
    return RuntimeEventPageResponse(**data)


@router.get("/sessions/{session_id}/runtime-events/export")
async def export_runtime_events_snapshot(session_id: str):
    data = await session_service.get_session(session_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Session not found")

    events = await runtime_event_service.list_all_runtime_events(session_id)
    snapshot = export_service.export_runtime_events_snapshot(events)
    filename = export_service.build_export_filename(data, "runtime-events.json")
    return Response(
        content=snapshot,
        media_type="application/json; charset=utf-8",
        headers={
            "Content-Disposition": export_service.build_content_disposition(filename)
        },
    )
