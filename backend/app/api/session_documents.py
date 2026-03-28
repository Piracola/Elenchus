from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.schemas import (
    ReferenceLibraryResponse,
    SessionDocumentListResponse,
    SessionDocumentResponse,
)
from app.services import document_service, reference_library_service, session_service
from app.services.session_document_workflow import upload_and_process_session_document

router = APIRouter(tags=["sessions"])


async def _require_session_record(db: AsyncSession, session_id: str):
    session_record = await session_service.get_session_record(db, session_id)
    if session_record is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session_record


async def _require_document_record(db: AsyncSession, session_id: str, document_id: str):
    document_record = await document_service.get_session_document_record(db, session_id, document_id)
    if document_record is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return document_record


@router.post("/sessions/{session_id}/documents", response_model=SessionDocumentResponse, status_code=201)
async def upload_session_document(
    session_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    session_record = await _require_session_record(db, session_id)
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
    await _require_session_record(db, session_id)
    documents = await document_service.list_session_documents(db, session_id)
    return SessionDocumentListResponse(documents=documents)


@router.get("/sessions/{session_id}/documents/{document_id}", response_model=SessionDocumentResponse)
async def get_session_document(
    session_id: str,
    document_id: str,
    db: AsyncSession = Depends(get_db),
):
    await _require_session_record(db, session_id)
    document = await document_service.get_session_document(db, session_id, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return SessionDocumentResponse(**document)


@router.get("/sessions/{session_id}/reference-library", response_model=ReferenceLibraryResponse)
async def get_reference_library(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    await _require_session_record(db, session_id)
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
    session_record = await _require_session_record(db, session_id)
    await _require_document_record(db, session_id, document_id)
    await reference_library_service.delete_reference_library_for_document(
        db,
        session_record=session_record,
        document_id=document_id,
    )
    deleted = await document_service.delete_session_document(db, session_id, document_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Document not found")
    return Response(status_code=204)
