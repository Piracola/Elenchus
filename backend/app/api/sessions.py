"""
Session CRUD REST API backed by the async database layer.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.schemas import (
    ExportFormat,
    SessionCreate,
    SessionListResponse,
    SessionResponse,
    RuntimeEventPageResponse,
)
from app.services import export_service, runtime_event_service, session_service

router = APIRouter(tags=["sessions"])


@router.post("/sessions", response_model=SessionResponse, status_code=201)
async def create_session(
    body: SessionCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new debate session."""
    data = await session_service.create_session(db, body)
    return SessionResponse(**data)


@router.get("/sessions", response_model=SessionListResponse)
async def list_sessions(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """List debate sessions with pagination."""
    items = await session_service.list_sessions(db, offset=offset, limit=limit)
    total = await session_service.count_sessions(db)
    return SessionListResponse(sessions=items, total=total)


@router.get("/sessions/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a single session's full data."""
    data = await session_service.get_session(db, session_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return SessionResponse(**data)


@router.get("/sessions/{session_id}/runtime-events", response_model=RuntimeEventPageResponse)
async def list_runtime_events(
    session_id: str,
    before_seq: int | None = Query(default=None, ge=1),
    limit: int = Query(default=200, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
):
    """Return persisted runtime event history for timeline/replay pagination."""
    session_record = await session_service.get_session_record(db, session_id)
    if session_record is None:
        raise HTTPException(status_code=404, detail="Session not found")

    data = await runtime_event_service.list_runtime_events(
        db,
        session_id,
        before_seq=before_seq,
        limit=limit,
    )
    return RuntimeEventPageResponse(**data)


@router.get("/sessions/{session_id}/runtime-events/export")
async def export_runtime_events_snapshot(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Export the full persisted runtime event history as a replay snapshot."""
    data = await session_service.get_session(db, session_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Session not found")

    events = await runtime_event_service.list_all_runtime_events(db, session_id)
    snapshot = export_service.export_runtime_events_snapshot(events)
    filename = export_service.build_export_filename(data, "runtime-events.json")
    return Response(
        content=snapshot,
        media_type="application/json",
        headers={
            "Content-Disposition": export_service.build_content_disposition(filename)
        },
    )


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a session."""
    deleted = await session_service.delete_session(db, session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found")
    return Response(status_code=204)


@router.get("/sessions/{session_id}/export")
async def export_session(
    session_id: str,
    format: ExportFormat = Query(default=ExportFormat.JSON),
    db: AsyncSession = Depends(get_db),
):
    """
    Export full session data.
    - format=json returns a JSON file
    - format=markdown returns a markdown file
    """
    data = await session_service.get_session(db, session_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Session not found")

    if format == ExportFormat.JSON:
        json_str = export_service.export_json(data)
        filename = export_service.build_export_filename(data, "json")
        return Response(
            content=json_str,
            media_type="application/json",
            headers={
                "Content-Disposition": export_service.build_content_disposition(filename)
            },
        )

    markdown = export_service.export_markdown(data)
    filename = export_service.build_export_filename(data, "md")
    return Response(
        content=markdown,
        media_type="text/markdown; charset=utf-8",
        headers={
            "Content-Disposition": export_service.build_content_disposition(filename)
        },
    )
