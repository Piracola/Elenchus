from __future__ import annotations

from typing import Any

from app.services import document_service, reference_library_service
from app.storage.session_files import StoredSessionRecord


async def upload_and_process_session_document(
    *,
    session_record: StoredSessionRecord,
    filename: str,
    mime_type: str,
    content: bytes,
) -> dict[str, Any]:
    document = await document_service.create_session_document(
        session_record.id,
        filename=filename,
        mime_type=mime_type,
        content=content,
    )
    document_record = await document_service.get_session_document_record(
        session_record.id,
        document["id"],
    )
    if document_record is None:
        return document

    processed = await reference_library_service.preprocess_session_document(
        session_record=session_record,
        document_record=document_record,
    )
    return await document_service.get_session_document(session_record.id, document["id"]) or processed["document"]
