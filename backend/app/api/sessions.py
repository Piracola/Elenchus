"""
Session CRUD REST API backed by the async database layer.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.schemas import (
    ExportFormat,
    ReferenceLibraryResponse,
    SessionCreate,
    SessionDocumentListResponse,
    SessionDocumentResponse,
    SessionListResponse,
    SessionResponse,
    RuntimeEventPageResponse,
)
from app.services import (
    document_service,
    export_service,
    reference_library_service,
    runtime_event_service,
    session_service,
)
from app.services.session_document_workflow import upload_and_process_session_document

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


@router.post("/sessions/{session_id}/documents", response_model=SessionDocumentResponse, status_code=201)
async def upload_session_document(
    session_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload a plain-text reference document for a session."""
    session_record = await session_service.get_session_record(db, session_id)
    if session_record is None:
        raise HTTPException(status_code=404, detail="Session not found")

    content = await file.read()
    try:
        document = await upload_and_process_session_document(
            db,
            session_record=session_record,
            filename=file.filename or "",
            mime_type=file.content_type or "",
            content=content,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        await file.close()

    return SessionDocumentResponse(**document)


@router.get("/sessions/{session_id}/documents", response_model=SessionDocumentListResponse)
async def list_session_documents(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """List all uploaded reference documents for a session."""
    session_record = await session_service.get_session_record(db, session_id)
    if session_record is None:
        raise HTTPException(status_code=404, detail="Session not found")

    documents = await document_service.list_session_documents(db, session_id)
    return SessionDocumentListResponse(documents=documents)


@router.get("/sessions/{session_id}/documents/{document_id}", response_model=SessionDocumentResponse)
async def get_session_document(
    session_id: str,
    document_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get one uploaded reference document including extracted text."""
    session_record = await session_service.get_session_record(db, session_id)
    if session_record is None:
        raise HTTPException(status_code=404, detail="Session not found")

    document = await document_service.get_session_document(db, session_id, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return SessionDocumentResponse(**document)


@router.get("/sessions/{session_id}/reference-library", response_model=ReferenceLibraryResponse)
async def get_reference_library(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Return structured reference-library entries for a session."""
    session_record = await session_service.get_session_record(db, session_id)
    if session_record is None:
        raise HTTPException(status_code=404, detail="Session not found")

    documents = await document_service.list_session_documents(db, session_id)
    library = await reference_library_service.list_reference_library(
        db,
        session_id,
        documents=documents,
    )
    return ReferenceLibraryResponse(**library)


@router.delete("/sessions/{session_id}/documents/{document_id}", status_code=204)
async def delete_session_document(
    session_id: str,
    document_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete one uploaded reference document from a session."""
    session_record = await session_service.get_session_record(db, session_id)
    if session_record is None:
        raise HTTPException(status_code=404, detail="Session not found")

    document_record = await document_service.get_session_document_record(db, session_id, document_id)
    if document_record is None:
        raise HTTPException(status_code=404, detail="Document not found")

    await reference_library_service.delete_reference_library_for_document(
        db,
        session_record=session_record,
        document_id=document_id,
    )
    deleted = await document_service.delete_session_document(db, session_id, document_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Document not found")
    return Response(status_code=204)


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
    categories: list[str] | None = Query(default=None),
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

    markdown = export_service.export_markdown(data, categories)
    filename = export_service.build_export_filename(data, "md")
    return Response(
        content=markdown,
        media_type="text/markdown; charset=utf-8",
        headers={
            "Content-Disposition": export_service.build_content_disposition(filename)
        },
    )
