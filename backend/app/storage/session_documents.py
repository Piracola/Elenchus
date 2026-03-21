"""File-backed persistence for session reference documents."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any

from app.storage.session_files import session_dir

_DOCUMENT_WRITE_LOCK = Lock()


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


def documents_dir(session_id: str) -> Path:
    directory = session_dir(session_id) / "documents"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def document_file(session_id: str, document_id: str) -> Path:
    return documents_dir(session_id) / f"{document_id}.json"


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
class StoredSessionDocument:
    id: str
    session_id: str
    filename: str
    mime_type: str
    size_bytes: int
    status: str
    raw_text: str | None
    normalized_text: str | None
    summary_short: str | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime


def _record_to_payload(record: StoredSessionDocument) -> dict[str, Any]:
    return {
        "id": record.id,
        "session_id": record.session_id,
        "filename": record.filename,
        "mime_type": record.mime_type,
        "size_bytes": record.size_bytes,
        "status": record.status,
        "raw_text": record.raw_text,
        "normalized_text": record.normalized_text,
        "summary_short": record.summary_short,
        "error_message": record.error_message,
        "created_at": _serialize_datetime(record.created_at),
        "updated_at": _serialize_datetime(record.updated_at),
    }


def _payload_to_record(payload: dict[str, Any]) -> StoredSessionDocument | None:
    document_id = str(payload.get("id", "") or "").strip()
    session_id = str(payload.get("session_id", "") or "").strip()
    filename = str(payload.get("filename", "") or "").strip()
    if not document_id or not session_id or not filename:
        return None

    return StoredSessionDocument(
        id=document_id,
        session_id=session_id,
        filename=filename,
        mime_type=str(payload.get("mime_type", "text/plain") or "text/plain"),
        size_bytes=int(payload.get("size_bytes", 0) or 0),
        status=str(payload.get("status", "uploaded") or "uploaded"),
        raw_text=str(payload.get("raw_text")) if payload.get("raw_text") is not None else None,
        normalized_text=(
            str(payload.get("normalized_text"))
            if payload.get("normalized_text") is not None
            else None
        ),
        summary_short=(
            str(payload.get("summary_short"))
            if payload.get("summary_short") is not None
            else None
        ),
        error_message=(
            str(payload.get("error_message"))
            if payload.get("error_message") is not None
            else None
        ),
        created_at=_parse_datetime(payload.get("created_at")),
        updated_at=_parse_datetime(payload.get("updated_at")),
    )


def write_document_record(record: StoredSessionDocument) -> None:
    with _DOCUMENT_WRITE_LOCK:
        _write_json_atomic(
            document_file(record.session_id, record.id),
            _record_to_payload(record),
        )


def read_document_record(session_id: str, document_id: str) -> StoredSessionDocument | None:
    payload = _read_json(document_file(session_id, document_id))
    if payload is None:
        return None
    return _payload_to_record(payload)


def list_document_records(session_id: str) -> list[StoredSessionDocument]:
    records: list[StoredSessionDocument] = []
    for path in documents_dir(session_id).glob("*.json"):
        payload = _read_json(path)
        if payload is None:
            continue
        record = _payload_to_record(payload)
        if record is not None:
            records.append(record)

    records.sort(key=lambda record: record.created_at, reverse=True)
    return records


def delete_document_record(session_id: str, document_id: str) -> None:
    with _DOCUMENT_WRITE_LOCK:
        document_file(session_id, document_id).unlink(missing_ok=True)
