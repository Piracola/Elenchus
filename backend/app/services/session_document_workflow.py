from __future__ import annotations

from typing import Any

from app.models.ledger import SessionRecord
from app.services import document_service


async def upload_and_process_session_document(
    *,
    session_record: SessionRecord,
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

    processed_document = await document_service.mark_session_document_processed(
        session_record.id,
        document_record.id,
    )
    if processed_document is not None:
        return processed_document
    return document
