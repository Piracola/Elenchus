"""Deterministic built-in reference seeding for special debate modes."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from app.db.db_utils import _gen_id, _utcnow
from app.models.schemas import DebateMode
from app.runtime_paths import get_runtime_paths
from app.storage.reference_library import (
    StoredReferenceLibraryEntry,
    read_document_entries,
    write_document_entries,
)
from app.storage.session_documents import (
    StoredSessionDocument,
    read_document_record,
    write_document_record,
)
from app.storage.session_files import read_session_record, write_session_record

BUILTIN_SOPHISTRY_DOCUMENT_ID = "builtin-sophistry-fallacy-catalog"
_CATALOG_FILENAME = "sophistry-fallacy-catalog.md"
BUILTIN_SOPHISTRY_FILENAME = "诡辩实验模式谬误库.md"
_SUMMARY_SECTION_KEYS = {"1. 使用说明", "2. 标注谨慎原则", "3. 推荐标准标签表", "6. 标注输出建议", "7. 结语"}


def _catalog_path_candidates() -> list[Path]:
    runtime_paths = get_runtime_paths()
    candidates = [
        runtime_paths.bundle_root / "docs" / _CATALOG_FILENAME,
        runtime_paths.runtime_root.parent / "docs" / _CATALOG_FILENAME,
        runtime_paths.runtime_root / "docs" / _CATALOG_FILENAME,
        Path(__file__).resolve().parents[3] / "docs" / _CATALOG_FILENAME,
    ]
    unique_candidates: list[Path] = []
    seen: set[str] = set()
    for candidate in candidates:
        key = str(candidate).lower()
        if key in seen:
            continue
        seen.add(key)
        unique_candidates.append(candidate)
    return unique_candidates


def _catalog_path() -> Path:
    candidates = _catalog_path_candidates()
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return candidates[0]


def _read_catalog_text() -> str:
    path = _catalog_path()
    if not path.is_file():
        searched_paths = ", ".join(str(candidate) for candidate in _catalog_path_candidates())
        raise FileNotFoundError(
            f"Built-in sophistry catalog was not found. Checked: {searched_paths}"
        )
    return path.read_text(encoding="utf-8")


def _normalize_block(text: str) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return "\n".join(lines).strip()


def _split_sections(text: str, marker: str) -> list[tuple[str, str]]:
    pattern = re.compile(rf"(?m)^{re.escape(marker)}\s+(.+?)\s*$")
    matches = list(pattern.finditer(text))
    sections: list[tuple[str, str]] = []
    for index, match in enumerate(matches):
        title = match.group(1).strip()
        body_start = match.end()
        body_end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        body = text[body_start:body_end].strip()
        sections.append((title, body))
    return sections


def _extract_label(body: str) -> str | None:
    match = re.search(r"-\s*标注名：`([^`]+)`", body)
    if match:
        return match.group(1).strip()
    return None


def _build_entry_content(title: str, body: str, label: str | None) -> str:
    normalized_body = _normalize_block(body)
    if label:
        return f"标签：{label}\n{normalized_body}" if normalized_body else f"标签：{label}"
    return normalized_body or title


def _build_summary_entries(
    *,
    session_id: str,
    document_id: str,
    document_name: str,
    text: str,
) -> list[StoredReferenceLibraryEntry]:
    now = _utcnow()
    entries: list[StoredReferenceLibraryEntry] = []
    source_order = 0

    for title, body in _split_sections(text, "##"):
        if title not in _SUMMARY_SECTION_KEYS:
            continue

        content = _normalize_block(re.sub(r"(?m)^###\s+.+$", "", body))
        if not content:
            continue

        entries.append(
            StoredReferenceLibraryEntry(
                id=_gen_id(),
                session_id=session_id,
                document_id=document_id,
                entry_type="reference_summary",
                title=title,
                content=content,
                payload={
                    "document_name": document_name,
                    "source_excerpt": content[:180],
                    "builtin": True,
                },
                importance=100,
                source_section=title,
                source_order=source_order,
                created_at=now,
                updated_at=now,
            )
        )
        source_order += 1

    return entries


def _build_term_entries(
    *,
    session_id: str,
    document_id: str,
    document_name: str,
    text: str,
    source_order_start: int,
) -> list[StoredReferenceLibraryEntry]:
    now = _utcnow()
    entries: list[StoredReferenceLibraryEntry] = []
    source_order = source_order_start

    for title, body in _split_sections(text, "###"):
        if not re.match(r"^(?:[A-E]\d{2}|5\.\d+)\.", title):
            continue

        label = _extract_label(body)
        display_title = title.split(".", 1)[1].strip() if "." in title else title
        content = _build_entry_content(display_title, body, label)
        if not content:
            continue

        importance = 85 if re.match(r"^[A-E]\d{2}\.", title) else 70
        entries.append(
            StoredReferenceLibraryEntry(
                id=_gen_id(),
                session_id=session_id,
                document_id=document_id,
                entry_type="reference_term",
                title=display_title,
                content=content,
                payload={
                    "document_name": document_name,
                    "source_excerpt": content[:180],
                    "label": label or "",
                    "builtin": True,
                },
                importance=importance,
                source_section=title,
                source_order=source_order,
                created_at=now,
                updated_at=now,
            )
        )
        source_order += 1

    return entries


def _build_builtin_entries(session_id: str, text: str) -> list[StoredReferenceLibraryEntry]:
    summary_entries = _build_summary_entries(
        session_id=session_id,
        document_id=BUILTIN_SOPHISTRY_DOCUMENT_ID,
        document_name=BUILTIN_SOPHISTRY_FILENAME,
        text=text,
    )
    term_entries = _build_term_entries(
        session_id=session_id,
        document_id=BUILTIN_SOPHISTRY_DOCUMENT_ID,
        document_name=BUILTIN_SOPHISTRY_FILENAME,
        text=text,
        source_order_start=len(summary_entries),
    )
    return [*summary_entries, *term_entries]


def _shared_knowledge_from_entry(entry: StoredReferenceLibraryEntry) -> dict[str, Any]:
    payload = entry.payload or {}
    knowledge = {
        "type": entry.entry_type,
        "document_id": entry.document_id,
        "document_name": BUILTIN_SOPHISTRY_FILENAME,
        "title": entry.title or "",
        "content": entry.content,
        "source_kind": "reference_document",
        "source_excerpt": str(payload.get("source_excerpt", "") or ""),
    }
    label = str(payload.get("label", "") or "")
    if label:
        knowledge["label"] = label
    return knowledge


def _sync_snapshot_with_entries(
    session_id: str,
    *,
    entries: list[StoredReferenceLibraryEntry],
) -> None:
    record = read_session_record(session_id)
    if record is None:
        return

    snapshot = dict(record.state_snapshot or {})
    shared_knowledge = snapshot.get("shared_knowledge", [])
    if not isinstance(shared_knowledge, list):
        shared_knowledge = []

    filtered_knowledge = [
        item
        for item in shared_knowledge
        if not (
            isinstance(item, dict)
            and str(item.get("source_kind", "") or "") == "reference_document"
            and str(item.get("document_id", "") or "") == BUILTIN_SOPHISTRY_DOCUMENT_ID
        )
    ]
    filtered_knowledge.extend(_shared_knowledge_from_entry(entry) for entry in entries)

    builtin_reference_docs = snapshot.get("builtin_reference_docs", [])
    if not isinstance(builtin_reference_docs, list):
        builtin_reference_docs = []

    filtered_docs = [
        item
        for item in builtin_reference_docs
        if not (
            isinstance(item, dict)
            and str(item.get("document_id", "") or "") == BUILTIN_SOPHISTRY_DOCUMENT_ID
        )
    ]
    filtered_docs.append(
        {
            "document_id": BUILTIN_SOPHISTRY_DOCUMENT_ID,
            "filename": BUILTIN_SOPHISTRY_FILENAME,
            "kind": "builtin_reference",
            "mode": DebateMode.SOPHISTRY_EXPERIMENT.value,
        }
    )

    snapshot["shared_knowledge"] = filtered_knowledge
    snapshot["builtin_reference_docs"] = filtered_docs
    record.state_snapshot = snapshot
    record.updated_at = _utcnow()
    write_session_record(record)


async def ensure_builtin_mode_references(
    session_id: str,
    *,
    debate_mode: str,
    mode_config: dict[str, Any] | None = None,
) -> None:
    """Seed deterministic built-in references for standalone modes."""
    if debate_mode != DebateMode.SOPHISTRY_EXPERIMENT.value:
        return

    config = mode_config if isinstance(mode_config, dict) else {}
    if not bool(config.get("seed_reference_enabled", True)):
        return

    text = _read_catalog_text()
    existing_document = read_document_record(session_id, BUILTIN_SOPHISTRY_DOCUMENT_ID)
    existing_entries = read_document_entries(session_id, BUILTIN_SOPHISTRY_DOCUMENT_ID)

    if existing_document is None:
        now = _utcnow()
        write_document_record(
            StoredSessionDocument(
                id=BUILTIN_SOPHISTRY_DOCUMENT_ID,
                session_id=session_id,
                filename=BUILTIN_SOPHISTRY_FILENAME,
                mime_type="text/markdown",
                size_bytes=len(text.encode("utf-8")),
                status="processed",
                raw_text=text,
                normalized_text=text,
                summary_short="诡辩实验模式的内置谬误与复合套路标签库。",
                error_message=None,
                created_at=now,
                updated_at=now,
            )
        )

    if not existing_entries:
        existing_entries = _build_builtin_entries(session_id, text)
        write_document_entries(
            session_id,
            BUILTIN_SOPHISTRY_DOCUMENT_ID,
            existing_entries,
        )

    _sync_snapshot_with_entries(
        session_id,
        entries=existing_entries,
    )
