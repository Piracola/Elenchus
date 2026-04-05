"""
REST API for debate session control (start/stop/intervene/status).

This module provides a REST alternative to WebSocket-based debate control,
making it easier for external agents (like openclaw) to manage debates.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.dependencies import get_debate_runtime_service
from app.models.schemas import SessionResponse
from app.runtime.service import DebateRuntimeService
from app.services import session_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sessions", tags=["session-control"])


class InterventionRequest(BaseModel):
    """Payload to intervene in a running debate."""

    content: str = Field(..., min_length=1, description="The intervention content")


class SessionStatusResponse(BaseModel):
    """Current debate session status."""

    session_id: str
    is_running: bool
    topic: str
    current_turn: int
    max_turns: int
    status: str
    participants: list[str]


class SessionStartResponse(BaseModel):
    """Response after starting a debate session."""

    success: bool
    session_id: str
    message: str
    session: SessionResponse | None = None


class SessionStopResponse(BaseModel):
    """Response after stopping a debate session."""

    success: bool
    session_id: str
    message: str


class InterventionResponse(BaseModel):
    """Response after queueing an intervention."""

    success: bool
    session_id: str
    message: str
    was_running: bool


class LiveEventItem(BaseModel):
    """Single live event item."""

    seq: int
    event_type: str
    phase: str | None = None
    source: str
    payload: dict[str, Any] = Field(default_factory=dict)
    timestamp: str


class LiveEventsResponse(BaseModel):
    """Response for live events polling."""

    session_id: str
    events: list[LiveEventItem]
    has_more: bool
    next_seq: int | None = None


@router.post("/{session_id}/start", response_model=SessionStartResponse)
async def start_debate_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    runtime_service: DebateRuntimeService = Depends(get_debate_runtime_service),
):
    """
    Start a debate session.

    Launches the debate asynchronously and returns immediately.
    Use GET /sessions/{id}/status to monitor progress.
    """
    # Verify session exists
    session_data = await session_service.get_session(db, session_id)
    if session_data is None:
        raise HTTPException(status_code=404, detail="Session not found")

    result = await runtime_service.start_session(session_id)

    if not result.started:
        raise HTTPException(status_code=409, detail=result.message or "Failed to start session")

    logger.info("Debate session %s started via REST API", session_id)

    return SessionStartResponse(
        success=True,
        session_id=session_id,
        message="Debate session started successfully",
        session=SessionResponse(**session_data),
    )


@router.post("/{session_id}/stop", response_model=SessionStopResponse)
async def stop_debate_session(
    session_id: str,
    runtime_service: DebateRuntimeService = Depends(get_debate_runtime_service),
):
    """
    Stop a running debate session.

    Returns immediately. The debate task will be cancelled.
    """
    stopped = await runtime_service.stop_session(session_id)

    if not stopped:
        return SessionStopResponse(
            success=False,
            session_id=session_id,
            message="Session was not running or already stopped",
        )

    logger.info("Debate session %s stopped via REST API", session_id)

    return SessionStopResponse(
        success=True,
        session_id=session_id,
        message="Debate session stopped successfully",
    )


@router.post("/{session_id}/intervene", response_model=InterventionResponse)
async def intervene_in_debate(
    session_id: str,
    request: InterventionRequest,
    runtime_service: DebateRuntimeService = Depends(get_debate_runtime_service),
):
    """
    Intervene in a running debate session.

    The intervention will be delivered to the next available debate round.
    Returns whether the session was running at the time of intervention.
    """
    was_running = await runtime_service.queue_intervention(session_id, request.content)

    if not was_running:
        return InterventionResponse(
            success=False,
            session_id=session_id,
            message="Intervention queued but session is not currently running",
            was_running=False,
        )

    logger.info("Intervention queued for session %s", session_id)

    return InterventionResponse(
        success=True,
        session_id=session_id,
        message="Intervention successfully queued",
        was_running=True,
    )


@router.get("/{session_id}/status", response_model=SessionStatusResponse)
async def get_debate_status(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    runtime_service: DebateRuntimeService = Depends(get_debate_runtime_service),
):
    """
    Get the current status of a debate session.

    Returns running state, current turn, and basic session info.
    """
    session_data = await session_service.get_session(db, session_id)
    if session_data is None:
        raise HTTPException(status_code=404, detail="Session not found")

    is_running = runtime_service.is_running(session_id)

    return SessionStatusResponse(
        session_id=session_id,
        is_running=is_running,
        topic=session_data.get("topic", ""),
        current_turn=session_data.get("current_turn", 0),
        max_turns=session_data.get("max_turns", 5),
        status=session_data.get("status", "pending"),
        participants=session_data.get("participants", []),
    )


@router.get("/{session_id}/live-events", response_model=LiveEventsResponse)
async def get_live_events(
    session_id: str,
    after_seq: int = Query(default=0, ge=0, description="Return events with seq > this value"),
    limit: int = Query(default=50, ge=1, le=200, description="Maximum events to return"),
    db: AsyncSession = Depends(get_db),
):
    """
    Poll for new runtime events from a debate session.

    Use after_seq parameter to get only events since your last poll.
    Returns events with seq > after_seq, up to limit events.
    """
    from app.services import runtime_event_service

    session_data = await session_service.get_session(db, session_id)
    if session_data is None:
        raise HTTPException(status_code=404, detail="Session not found")

    # Get all events and filter client-side (since storage is file-based)
    all_events_result = await runtime_event_service.list_all_runtime_events(None, session_id)
    all_events = all_events_result if isinstance(all_events_result, list) else []

    # Filter events with seq > after_seq
    filtered_events = [e for e in all_events if e.get("seq", 0) > after_seq]

    # Apply limit
    limited_events = filtered_events[:limit]

    event_items = [
        LiveEventItem(
            seq=event.get("seq", 0),
            event_type=event.get("type", "system"),
            phase=event.get("phase"),
            source=event.get("source", "runtime"),
            payload=event.get("payload", {}),
            timestamp=event.get("timestamp", ""),
        )
        for event in limited_events
    ]

    has_more = len(filtered_events) > limit
    next_seq = limited_events[-1].get("seq") if limited_events else None

    return LiveEventsResponse(
        session_id=session_id,
        events=event_items,
        has_more=has_more,
        next_seq=next_seq,
    )
