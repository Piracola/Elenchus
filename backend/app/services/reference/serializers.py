from __future__ import annotations

from typing import Any

from app.agents.reference_preprocessor import PreprocessedReferenceEntry
from app.db.db_utils import _gen_id, _utcnow
from app.storage.reference_library import StoredReferenceLibraryEntry
from app.storage.session_documents import StoredSessionDocument


def reference_entry_to_dict(entry: StoredReferenceLibraryEntry) -> dict[str, Any]:
    return {
        "id": entry.id,
        "session_id": entry.session_id,
        "document_id": entry.document_id,
        "entry_type": entry.entry_type,
        "title": entry.title,
        "content": entry.content,
        "payload": entry.payload or {},
        "importance": entry.importance,
        "source_section": entry.source_section,
        "source_order": entry.source_order,
        "created_at": entry.created_at,
        "updated_at": entry.updated_at,
    }


def reference_document_to_dict(document: StoredSessionDocument) -> dict[str, Any]:
    return {
        "id": document.id,
        "session_id": document.session_id,
        "filename": document.filename,
        "mime_type": document.mime_type,
        "size_bytes": document.size_bytes,
        "status": document.status,
        "summary_short": document.summary_short,
        "error_message": document.error_message,
        "created_at": document.created_at,
        "updated_at": document.updated_at,
    }


def build_stored_reference_entries(
    *,
    session_id: str,
    document_id: str,
    entries: list[PreprocessedReferenceEntry],
) -> list[StoredReferenceLibraryEntry]:
    now = _utcnow()
    return [
        StoredReferenceLibraryEntry(
            id=_gen_id(),
            session_id=session_id,
            document_id=document_id,
            entry_type=entry.entry_type,
            title=entry.title,
            content=entry.content,
            payload=entry.payload,
            importance=entry.importance,
            source_section=entry.source_section,
            source_order=entry.source_order,
            created_at=now,
            updated_at=now,
        )
        for entry in entries
    ]
