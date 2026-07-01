from __future__ import annotations

import re
from typing import Any

from app.models.ledger import SessionDocumentRecord

from .payloads import document_context_entry

BUILTIN_SOPHISTRY_DOCUMENT_ID = "builtin-sophistry-fallacy-catalog"
BUILTIN_SOPHISTRY_FILENAME = "诡辩实验模式谬误库.md"
_SUMMARY_SECTION_KEYS = {"1. 使用说明", "2. 标注谨慎原则", "3. 推荐标准标签表", "6. 标注输出建议", "7. 结语"}


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
        sections.append((title, text[body_start:body_end].strip()))
    return sections


def _extract_label(body: str) -> str | None:
    match = re.search(r"-\s*标注名：`([^`]+)`", body)
    return match.group(1).strip() if match else None


def builtin_reference_entries(record: SessionDocumentRecord) -> list[dict[str, Any]]:
    text = str(record.normalized_text or record.raw_text or "")
    if not text.strip():
        return []

    entries: list[dict[str, Any]] = []
    source_order = 0
    for title, body in _split_sections(text, "##"):
        if title not in _SUMMARY_SECTION_KEYS:
            continue
        content = _normalize_block(re.sub(r"(?m)^###\s+.+$", "", body))
        if not content:
            continue
        entries.append(
            {
                "type": "reference_summary",
                "document_id": record.id,
                "document_name": BUILTIN_SOPHISTRY_FILENAME,
                "title": title,
                "content": content,
                "source_kind": "reference_document",
                "source_excerpt": content[:180],
                "source_order": source_order,
            }
        )
        source_order += 1

    for title, body in _split_sections(text, "###"):
        if not re.match(r"^(?:[A-E]\d{2}|5\.\d+)\.", title):
            continue
        label = _extract_label(body)
        display_title = title.split(".", 1)[1].strip() if "." in title else title
        normalized_body = _normalize_block(body)
        if label:
            content = f"标签：{label}\n{normalized_body}" if normalized_body else f"标签：{label}"
        else:
            content = normalized_body or display_title
        if not content:
            continue
        entry = {
            "type": "reference_term",
            "document_id": record.id,
            "document_name": BUILTIN_SOPHISTRY_FILENAME,
            "title": display_title,
            "content": content,
            "source_kind": "reference_document",
            "source_excerpt": content[:180],
            "source_order": source_order,
        }
        if label:
            entry["label"] = label
        entries.append(entry)
        source_order += 1

    return entries


def document_projection_entry(record: SessionDocumentRecord) -> dict[str, Any] | None:
    if record.id == BUILTIN_SOPHISTRY_DOCUMENT_ID:
        return None
    return document_context_entry(
        document_id=record.id,
        filename=record.filename,
        normalized_text=record.normalized_text,
    )


def builtin_reference_doc(record: SessionDocumentRecord) -> dict[str, Any]:
    return {
        "document_id": record.id,
        "filename": record.filename,
        "kind": "builtin_reference",
        "mode": "sophistry_experiment",
    }

