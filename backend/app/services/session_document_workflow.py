from __future__ import annotations

from typing import Any

from app.db.db_utils import _utcnow
from app.services import document_service
from app.storage.session_files import StoredSessionRecord
from app.storage.session_files import read_session_record, write_session_record

_DOCUMENT_CONTEXT_LIMIT = 12000


def _truncate_document_context(text: str) -> str:
    normalized = text.strip()
    if len(normalized) <= _DOCUMENT_CONTEXT_LIMIT:
        return normalized
    return normalized[:_DOCUMENT_CONTEXT_LIMIT].rstrip() + "\n\n[内容已截断，仅保留前文作为辩论背景。]"


def _document_context_entry(document: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "context",
        "source_kind": "session_document",
        "document_id": document["id"],
        "document_name": document["filename"],
        "title": document["filename"],
        "content": _truncate_document_context(str(document.get("normalized_text") or "")),
    }


def sync_document_context_knowledge(session_id: str, document: dict[str, Any]) -> None:
    record = read_session_record(session_id)
    if record is None:
        return
    snapshot = dict(record.state_snapshot or {})
    shared_knowledge = snapshot.get("shared_knowledge", [])
    if not isinstance(shared_knowledge, list):
        shared_knowledge = []

    document_id = str(document.get("id") or "")
    filtered = [
        item
        for item in shared_knowledge
        if not (
            isinstance(item, dict)
            and str(item.get("source_kind", "") or "") == "session_document"
            and str(item.get("document_id", "") or "") == document_id
        )
    ]
    filtered.append(_document_context_entry(document))
    snapshot["shared_knowledge"] = filtered
    record.state_snapshot = snapshot
    record.updated_at = _utcnow()
    write_session_record(record)


def remove_document_context_knowledge(session_id: str, document_id: str) -> None:
    record = read_session_record(session_id)
    if record is None:
        return
    snapshot = dict(record.state_snapshot or {})
    shared_knowledge = snapshot.get("shared_knowledge", [])
    if not isinstance(shared_knowledge, list):
        return
    snapshot["shared_knowledge"] = [
        item
        for item in shared_knowledge
        if not (
            isinstance(item, dict)
            and str(item.get("source_kind", "") or "") == "session_document"
            and str(item.get("document_id", "") or "") == document_id
        )
    ]
    record.state_snapshot = snapshot
    record.updated_at = _utcnow()
    write_session_record(record)


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

    processed_document = await document_service.mark_session_document_processed(
        session_record.id,
        document_record.id,
    )
    if processed_document is not None:
        sync_document_context_knowledge(session_record.id, processed_document)
        return processed_document
    sync_document_context_knowledge(session_record.id, document)
    return document
