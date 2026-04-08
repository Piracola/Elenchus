from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app.models.schemas import RuntimeEventPageResponse
from app.services import export_service, runtime_event_service, session_service

router = APIRouter(tags=["sessions"])


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
