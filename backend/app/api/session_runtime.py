from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.dependencies import get_debate_runtime_service
from app.runtime.service import DebateRuntimeService
from app.services import session_service

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


@router.post("/sessions/{session_id}/start", response_model=StartDebateResponse, include_in_schema=False)
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

    return StartDebateResponse(
        started=True,
        session_id=session_id,
    )


@router.post("/sessions/{session_id}/stop", include_in_schema=False)
async def stop_debate_session(
    session_id: str,
    runtime_service: DebateRuntimeService = Depends(get_debate_runtime_service),
):
    """Stop a running debate session via REST API."""
    stopped = await runtime_service.stop_session(session_id)
    if not stopped:
        raise HTTPException(status_code=404, detail="No running debate found for this session")
    return {"stopped": True, "session_id": session_id}


__all__ = [
    "router",
    "start_debate_session",
    "stop_debate_session",
]
