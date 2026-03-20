"""Service layer for structured per-session reference-library entries."""

from __future__ import annotations

from dataclasses import replace
from typing import Any

from app.agents.reference_preprocessor import (
    PreprocessedReferenceEntry,
    build_reference_entries,
    preprocess_reference_document,
)
from app.db.models import _gen_id, _utcnow
from app.storage.reference_library import (
    StoredReferenceLibraryEntry,
    delete_document_entries,
    list_reference_entries,
    read_document_entries,
    write_document_entries,
)
from app.storage.session_documents import StoredSessionDocument, write_document_record
from app.storage.session_files import StoredSessionRecord, read_session_record, write_session_record


def _entry_to_dict(entry: StoredReferenceLibraryEntry) -> dict[str, Any]:
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


def _document_to_dict(document: StoredSessionDocument) -> dict[str, Any]:
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


def _shared_knowledge_from_entry(
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


def _replace_document_reference_knowledge(
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
        _shared_knowledge_from_entry(entry, document_filename=document_filename)
        for entry in entries
        if entry.entry_type in {"reference_summary", "reference_term", "reference_claim"}
    )
    snapshot["shared_knowledge"] = filtered
    record.state_snapshot = snapshot
    record.updated_at = _utcnow()
    write_session_record(record)


def _remove_document_reference_knowledge(
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


def _build_stored_entries(
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


async def preprocess_session_document(
    _db: Any,
    *,
    session_record: StoredSessionRecord,
    document_record: StoredSessionDocument,
) -> dict[str, Any]:
    """Run preprocessing for one stored document and sync shared knowledge."""
    processing_document = replace(
        document_record,
        status="processing",
        error_message=None,
        updated_at=_utcnow(),
    )
    write_document_record(processing_document)

    agent_configs = (session_record.state_snapshot or {}).get("agent_configs", {})
    override = None
    if isinstance(agent_configs, dict):
        candidate = agent_configs.get("fact_checker") or agent_configs.get("judge")
        if isinstance(candidate, dict):
            override = candidate

    try:
        processed = await preprocess_reference_document(
            filename=document_record.filename,
            content=document_record.normalized_text or document_record.raw_text or "",
            override=override,
        )
        built_entries = build_reference_entries(processed)
        stored_entries = _build_stored_entries(
            session_id=document_record.session_id,
            document_id=document_record.id,
            entries=built_entries,
        )
        write_document_entries(
            document_record.session_id,
            document_record.id,
            stored_entries,
        )

        updated_document = replace(
            document_record,
            status="processed",
            summary_short=str(processed.get("summary", "") or document_record.summary_short or ""),
            error_message=None,
            updated_at=_utcnow(),
        )
        write_document_record(updated_document)
        _replace_document_reference_knowledge(
            document_record.session_id,
            document_id=document_record.id,
            document_filename=document_record.filename,
            entries=stored_entries,
        )
        return {
            "document": _document_to_dict(updated_document),
            "entries": [_entry_to_dict(entry) for entry in stored_entries],
        }
    except Exception as exc:
        failed_document = replace(
            document_record,
            status="failed",
            error_message=str(exc),
            updated_at=_utcnow(),
        )
        write_document_record(failed_document)
        delete_document_entries(document_record.session_id, document_record.id)
        _remove_document_reference_knowledge(document_record.session_id, document_id=document_record.id)
        return {
            "document": _document_to_dict(failed_document),
            "entries": [],
        }


async def list_reference_library(
    _db: Any,
    session_id: str,
    *,
    documents: list[dict[str, Any]],
) -> dict[str, Any]:
    """Return the current structured reference-library payload for one session."""
    entries = [_entry_to_dict(entry) for entry in list_reference_entries(session_id)]
    return {
        "documents": documents,
        "entries": entries,
    }


async def delete_reference_library_for_document(
    _db: Any,
    *,
    session_record: StoredSessionRecord,
    document_id: str,
) -> None:
    """Delete structured reference entries and synced shared knowledge for one document."""
    delete_document_entries(session_record.id, document_id)
    _remove_document_reference_knowledge(session_record.id, document_id=document_id)


async def get_reference_entries_for_document(
    _db: Any,
    session_id: str,
    document_id: str,
) -> list[dict[str, Any]]:
    """Return stored structured entries for one document."""
    return [
        _entry_to_dict(entry)
        for entry in read_document_entries(session_id, document_id)
    ]
