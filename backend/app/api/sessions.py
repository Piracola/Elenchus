"""
Session CRUD REST API — backed by SQLAlchemy async database.
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
)
from app.services import session_service, export_service

router = APIRouter(tags=["sessions"])


# ── Create ───────────────────────────────────────────────────────

@router.post("/sessions", response_model=SessionResponse, status_code=201)
async def create_session(body: SessionCreate, db: AsyncSession = Depends(get_db)):
    """Create a new debate session."""
    data = await session_service.create_session(db, body)
    return SessionResponse(**data)


# ── List ─────────────────────────────────────────────────────────

@router.get("/sessions", response_model=SessionListResponse)
async def list_sessions(db: AsyncSession = Depends(get_db)):
    """List all debate sessions."""
    items = await session_service.list_sessions(db)
    return SessionListResponse(sessions=items, total=len(items))


# ── Get ──────────────────────────────────────────────────────────

@router.get("/sessions/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str, db: AsyncSession = Depends(get_db)):
    """Get a single session's full data."""
    data = await session_service.get_session(db, session_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return SessionResponse(**data)


# ── Delete ───────────────────────────────────────────────────────

@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(session_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a session."""
    deleted = await session_service.delete_session(db, session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found")
    return Response(status_code=204)


# ── Export ───────────────────────────────────────────────────────

@router.get("/sessions/{session_id}/export")
async def export_session(
    session_id: str,
    format: ExportFormat = Query(default=ExportFormat.JSON),
    db: AsyncSession = Depends(get_db),
):
    """
    Export full session data.
    - format=json  → returns JSON object
    - format=markdown → returns { content: "...", format: "markdown" }
    """
    data = await session_service.get_session(db, session_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Session not found")

    if format == ExportFormat.JSON:
        json_str = export_service.export_json(data)
        return Response(
            content=json_str,
            media_type="application/json",
            headers={
                "Content-Disposition": f'attachment; filename="elenchus_session_{session_id}.json"'
            },
        )

    # Markdown
    md_str = export_service.export_markdown(data)
    return Response(
        content=md_str,
        media_type="text/markdown; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="elenchus_session_{session_id}.md"'
        },
    )
