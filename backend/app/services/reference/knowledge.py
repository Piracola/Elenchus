from __future__ import annotations

from typing import Any

from app.db.db_utils import _utcnow
from app.storage.reference_library import StoredReferenceLibraryEntry
from app.storage.session_files import read_session_record, write_session_record


def shared_knowledge_from_reference_entry(
    entry: StoredReferenceLibraryEntry,
    *,
    document_filename: str,
) -> dict[str, Any]:
    payload = entry.payload or {}
    knowledge = {
        "type": entry.entry_type,
        "document_id": entry.document_id,
        "document_name": document_filename,
        "title": entry.title or "",
        "content": entry.content,
        "source_kind": "reference_document",
        "source_excerpt": str(payload.get("source_excerpt", "") or ""),
    }
    validation_status = payload.get("validation_status")
    if isinstance(validation_status, str) and validation_status:
        knowledge["validation_status"] = validation_status
    return knowledge


def replace_document_reference_knowledge(
    session_id: str,
    *,
    document_id: str,
    document_filename: str,
    entries: list[StoredReferenceLibraryEntry],
) -> None:
    record = read_session_record(session_id)
    if record is None:
        return
    snapshot = dict(record.state_snapshot or {})
    shared_knowledge = snapshot.get("shared_knowledge", [])
    if not isinstance(shared_knowledge, list):
        shared_knowledge = []

    filtered = [
        item
        for item in shared_knowledge
        if not (
            isinstance(item, dict)
            and str(item.get("source_kind", "") or "") == "reference_document"
            and str(item.get("document_id", "") or "") == document_id
        )
    ]
    filtered.extend(
        shared_knowledge_from_reference_entry(entry, document_filename=document_filename)
        for entry in entries
        if entry.entry_type in {"reference_summary", "reference_term", "reference_claim"}
    )
    snapshot["shared_knowledge"] = filtered
    record.state_snapshot = snapshot
    record.updated_at = _utcnow()
    write_session_record(record)


def remove_document_reference_knowledge(
    session_id: str,
    *,
    document_id: str,
) -> None:
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
            and str(item.get("source_kind", "") or "") == "reference_document"
            and str(item.get("document_id", "") or "") == document_id
        )
    ]
    record.state_snapshot = snapshot
    record.updated_at = _utcnow()
    write_session_record(record)
