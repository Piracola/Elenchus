"""Deterministic built-in reference seeding for special debate modes."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from app.db.db_utils import _gen_id, _utcnow
from app.models.schemas import DebateMode
from app.runtime_paths import get_runtime_paths
from app.services.run_ledger_service import RunLedgerService

BUILTIN_SOPHISTRY_DOCUMENT_ID = "builtin-sophistry-fallacy-catalog"
_CATALOG_FILENAME = "sophistry-fallacy-catalog.md"
BUILTIN_SOPHISTRY_FILENAME = "诡辩实验模式谬误库.md"
_SUMMARY_SECTION_KEYS = {"1. 使用说明", "2. 标注谨慎原则", "3. 推荐标准标签表", "6. 标注输出建议", "7. 结语"}
_ledger = RunLedgerService()


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
    now = _utcnow()
    await _ledger.upsert_session_document(
        session_id,
        {
            "id": BUILTIN_SOPHISTRY_DOCUMENT_ID,
            "filename": BUILTIN_SOPHISTRY_FILENAME,
            "mime_type": "text/markdown",
            "size_bytes": len(text.encode("utf-8")),
            "status": "processed",
            "raw_text": text,
            "normalized_text": text,
            "summary_short": "诡辩实验模式的内置谬误与复合套路标签库。",
            "error_message": None,
            "created_at": now,
            "updated_at": now,
        },
    )
