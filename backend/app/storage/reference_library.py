"""File-backed persistence for structured reference-library entries."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any

from app.storage.session_files import session_dir

_REFERENCE_WRITE_LOCK = Lock()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _serialize_datetime(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def _parse_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str) and value:
        normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
        try:
            parsed = datetime.fromisoformat(normalized)
        except ValueError:
            return _utcnow()
    else:
        return _utcnow()

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def reference_entries_dir(session_id: str) -> Path:
    directory = session_dir(session_id) / "reference_entries"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def reference_entries_file(session_id: str, document_id: str) -> Path:
    return reference_entries_dir(session_id) / f"{document_id}.json"


def _write_text_atomic(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(f"{path.suffix}.tmp")
    temp_path.write_text(content, encoding="utf-8")
    temp_path.replace(path)


def _write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    serialized = json.dumps(payload, ensure_ascii=False, indent=2)
    _write_text_atomic(path, serialized)


def _read_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None

    return data if isinstance(data, dict) else None


@dataclass(slots=True)
class StoredReferenceLibraryEntry:
    id: str
    session_id: str
    document_id: str
    entry_type: str
    title: str | None
    content: str
    payload: dict[str, Any] | None
    importance: int
    source_section: str | None
    source_order: int
    created_at: datetime
    updated_at: datetime


def _entry_to_payload(entry: StoredReferenceLibraryEntry) -> dict[str, Any]:
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
        "created_at": _serialize_datetime(entry.created_at),
        "updated_at": _serialize_datetime(entry.updated_at),
    }


def _payload_to_entry(payload: dict[str, Any]) -> StoredReferenceLibraryEntry | None:
    entry_id = str(payload.get("id", "") or "").strip()
    session_id = str(payload.get("session_id", "") or "").strip()
    document_id = str(payload.get("document_id", "") or "").strip()
    entry_type = str(payload.get("entry_type", "") or "").strip()
    content = str(payload.get("content", "") or "").strip()
    if not entry_id or not session_id or not document_id or not entry_type or not content:
        return None

    raw_payload = payload.get("payload")
    return StoredReferenceLibraryEntry(
        id=entry_id,
        session_id=session_id,
        document_id=document_id,
        entry_type=entry_type,
        title=str(payload.get("title")) if payload.get("title") is not None else None,
        content=content,
        payload=raw_payload if isinstance(raw_payload, dict) else {},
        importance=int(payload.get("importance", 0) or 0),
        source_section=(
            str(payload.get("source_section"))
            if payload.get("source_section") is not None
            else None
        ),
        source_order=int(payload.get("source_order", 0) or 0),
        created_at=_parse_datetime(payload.get("created_at")),
        updated_at=_parse_datetime(payload.get("updated_at")),
    )


def write_document_entries(
    session_id: str,
    document_id: str,
    entries: list[StoredReferenceLibraryEntry],
) -> None:
    payload = {
        "session_id": session_id,
        "document_id": document_id,
        "entries": [_entry_to_payload(entry) for entry in entries],
    }
    with _REFERENCE_WRITE_LOCK:
        _write_json_atomic(reference_entries_file(session_id, document_id), payload)


def read_document_entries(
    session_id: str,
    document_id: str,
) -> list[StoredReferenceLibraryEntry]:
    payload = _read_json(reference_entries_file(session_id, document_id))
    if payload is None:
        return []

    entries: list[StoredReferenceLibraryEntry] = []
    for item in payload.get("entries", []):
        if not isinstance(item, dict):
            continue
        entry = _payload_to_entry(item)
        if entry is not None:
            entries.append(entry)

    entries.sort(key=lambda entry: (entry.source_order, -entry.importance, entry.created_at))
    return entries


def list_reference_entries(session_id: str) -> list[StoredReferenceLibraryEntry]:
    entries: list[StoredReferenceLibraryEntry] = []
    for path in reference_entries_dir(session_id).glob("*.json"):
        payload = _read_json(path)
        if payload is None:
            continue
        for item in payload.get("entries", []):
            if not isinstance(item, dict):
                continue
            entry = _payload_to_entry(item)
            if entry is not None:
                entries.append(entry)

    entries.sort(
        key=lambda entry: (
            entry.document_id,
            entry.source_order,
            -entry.importance,
            entry.created_at,
        )
    )
    return entries


def delete_document_entries(session_id: str, document_id: str) -> None:
    with _REFERENCE_WRITE_LOCK:
        reference_entries_file(session_id, document_id).unlink(missing_ok=True)
