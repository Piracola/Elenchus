"""Service helpers for session reference document storage."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from app.db.models import _gen_id, _utcnow
from app.storage.session_documents import (
    StoredSessionDocument,
    delete_document_record,
    list_document_records,
    read_document_record,
    write_document_record,
)

_MAX_DOCUMENT_BYTES = 1 * 1024 * 1024
_SUPPORTED_SUFFIXES = {".txt", ".md", ".markdown"}
_SUPPORTED_MIME_TYPES = {
    "text/plain",
    "text/markdown",
    "text/x-markdown",
    "text/md",
}
_SUMMARY_LIMIT = 240


def _normalize_mime_type(filename: str, mime_type: str) -> str:
    normalized = (mime_type or "").strip().lower()
    if normalized:
        if normalized == "text/plain" and Path(filename).suffix.lower() in {".md", ".markdown"}:
            return "text/markdown"
        return normalized

    if Path(filename).suffix.lower() in {".md", ".markdown"}:
        return "text/markdown"
    return "text/plain"


def _validate_file_type(filename: str, mime_type: str) -> None:
    suffix = Path(filename).suffix.lower()
    normalized_mime_type = (mime_type or "").strip().lower()
    if suffix in _SUPPORTED_SUFFIXES:
        return
    if normalized_mime_type in _SUPPORTED_MIME_TYPES:
        return
    raise ValueError("Unsupported file type. Only .txt and .md files are allowed.")


def _decode_text_content(content: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ValueError("Unable to decode the uploaded file as text.")


def _normalize_text(text: str) -> str:
    cleaned = text.replace("\r\n", "\n").replace("\r", "\n").replace("\x00", "")
    cleaned_lines = [line.rstrip() for line in cleaned.split("\n")]
    return "\n".join(cleaned_lines).strip()


def _build_summary_short(text: str) -> str | None:
    condensed = " ".join(segment.strip() for segment in text.splitlines() if segment.strip())
    if not condensed:
        return None
    if len(condensed) <= _SUMMARY_LIMIT:
        return condensed
    return condensed[:_SUMMARY_LIMIT].rstrip() + "..."


def _record_to_dict(record: StoredSessionDocument, *, include_content: bool) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": record.id,
        "session_id": record.session_id,
        "filename": record.filename,
        "mime_type": record.mime_type,
        "size_bytes": record.size_bytes,
        "status": record.status,
        "summary_short": record.summary_short,
        "error_message": record.error_message,
        "created_at": record.created_at,
        "updated_at": record.updated_at,
    }
    if include_content:
        payload["raw_text"] = record.raw_text
        payload["normalized_text"] = record.normalized_text
    return payload


async def create_session_document(
    _db: Any,
    session_id: str,
    *,
    filename: str,
    mime_type: str,
    content: bytes,
) -> dict[str, Any]:
    """Validate, decode, and store a session-scoped document."""
    trimmed_filename = filename.strip()
    if not trimmed_filename:
        raise ValueError("Filename is required.")
    if not content:
        raise ValueError("Uploaded file is empty.")
    if len(content) > _MAX_DOCUMENT_BYTES:
        raise ValueError("Uploaded file is too large. Limit is 1 MB.")

    _validate_file_type(trimmed_filename, mime_type)

    raw_text = _decode_text_content(content)
    normalized_text = _normalize_text(raw_text)
    if not normalized_text:
        raise ValueError("Uploaded file does not contain readable text.")

    now = _utcnow()
    record = StoredSessionDocument(
        id=_gen_id(),
        session_id=session_id,
        filename=trimmed_filename,
        mime_type=_normalize_mime_type(trimmed_filename, mime_type),
        size_bytes=len(content),
        status="uploaded",
        raw_text=raw_text,
        normalized_text=normalized_text,
        summary_short=_build_summary_short(normalized_text),
        error_message=None,
        created_at=now,
        updated_at=now,
    )
    write_document_record(record)
    return _record_to_dict(record, include_content=True)


async def get_session_document_record(
    _db: Any,
    session_id: str,
    document_id: str,
) -> StoredSessionDocument | None:
    """Return the raw stored document record for internal workflows."""
    return read_document_record(session_id, document_id)


async def list_session_documents(_db: Any, session_id: str) -> list[dict[str, Any]]:
    """Return all stored documents for a session, newest first."""
    return [
        _record_to_dict(record, include_content=False)
        for record in list_document_records(session_id)
    ]


async def get_session_document(
    _db: Any,
    session_id: str,
    document_id: str,
) -> dict[str, Any] | None:
    """Return a single stored document, including extracted text."""
    record = read_document_record(session_id, document_id)
    if record is None:
        return None
    return _record_to_dict(record, include_content=True)


async def delete_session_document(
    _db: Any,
    session_id: str,
    document_id: str,
) -> bool:
    """Delete a single stored document for a session."""
    record = read_document_record(session_id, document_id)
    if record is None:
        return False

    delete_document_record(session_id, document_id)
    return True
