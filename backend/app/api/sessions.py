"""
Session CRUD REST API backed by file-based session storage.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app.api.session_documents import router as session_documents_router
from app.api.session_runtime import router as session_runtime_router
from app.models.schemas import (
    ExportFormat,
    SessionCreate,
    SessionListResponse,
    SessionResponse,
)
from app.services import export_service, session_service

router = APIRouter(tags=["sessions"])
router.include_router(session_documents_router)
router.include_router(session_runtime_router)


@router.post("/sessions", response_model=SessionResponse, status_code=201)
async def create_session(body: SessionCreate):
    """Create a new debate session."""
    data = await session_service.create_session(body)
    return SessionResponse(**data)


@router.get("/sessions", response_model=SessionListResponse)
async def list_sessions(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
):
    """List debate sessions with pagination."""
    items = await session_service.list_sessions(offset=offset, limit=limit)
    total = await session_service.count_sessions()
    return SessionListResponse(sessions=items, total=total)


@router.get("/sessions/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str):
    """Get a single session's full data."""
    data = await session_service.get_session(session_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return SessionResponse(**data)


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(session_id: str):
    """Delete a session."""
    deleted = await session_service.delete_session(session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found")
    return Response(status_code=204)


@router.get("/sessions/{session_id}/export")
async def export_session(
    session_id: str,
    format: ExportFormat = Query(default=ExportFormat.JSON),
    categories: list[str] | None = Query(default=None),
):
    """
    Export full session data.
    - format=json returns a JSON file
    - format=markdown returns a markdown file
    """
    data = await session_service.get_session(session_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Session not found")

    if format == ExportFormat.JSON:
        json_str = export_service.export_json(data)
        filename = export_service.build_export_filename(data, "json")
        return Response(
            content=json_str,
            media_type="application/json; charset=utf-8",
            headers={
                "Content-Disposition": export_service.build_content_disposition(filename)
            },
        )

    markdown = export_service.export_markdown(data, categories)
    filename = export_service.build_export_filename(data, "md")
    return Response(
        content=markdown,
        media_type="text/markdown; charset=utf-8",
        headers={
            "Content-Disposition": export_service.build_content_disposition(filename)
        },
    )
