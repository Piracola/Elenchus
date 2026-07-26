"""Tests for deterministic built-in reference seeding."""

from __future__ import annotations

import pytest

from app.models.schemas import SessionCreate
from app.services import builtin_reference_service, session_service
from app.services.builtin_reference_service import (
    BUILTIN_SOPHISTRY_DOCUMENT_ID,
    ensure_builtin_mode_references,
)


@pytest.mark.asyncio
async def test_ensure_builtin_mode_references_seeds_once_and_syncs_snapshot():
    created = await session_service.create_session(
        SessionCreate(
            topic="Built-in references",
            debate_mode="sophistry_experiment",
        ),
    )

    await ensure_builtin_mode_references(
        created["id"],
        debate_mode="sophistry_experiment",
        mode_config=created["mode_config"],
    )
    await ensure_builtin_mode_references(
        created["id"],
        debate_mode="sophistry_experiment",
        mode_config=created["mode_config"],
    )

    documents = await session_service.list_session_documents(created["id"])
    session = await session_service.get_session(created["id"])
    assert session is not None
    shared_knowledge = session.get("shared_knowledge", [])

    assert len([item for item in documents if item.get("id") == BUILTIN_SOPHISTRY_DOCUMENT_ID]) == 1
    assert any(item.get("document_id") == BUILTIN_SOPHISTRY_DOCUMENT_ID for item in shared_knowledge)
    assert {item.get("type") for item in shared_knowledge} >= {"reference_summary", "reference_term"}


def test_read_catalog_text_uses_first_existing_fallback_candidate(monkeypatch):
    class _FakePath:
        def __init__(self, path: str, *, exists: bool, text: str = "") -> None:
            self._path = path
            self._exists = exists
            self._text = text

        def is_file(self) -> bool:
            return self._exists

        def read_text(self, *, encoding: str) -> str:
            assert encoding == "utf-8"
            return self._text

        def __str__(self) -> str:
            return self._path

    monkeypatch.setattr(
        builtin_reference_service,
        "_catalog_path_candidates",
        lambda: [
            _FakePath("missing.md", exists=False),
            _FakePath("fallback.md", exists=True, text="fallback catalog"),
        ],
    )

    assert builtin_reference_service._read_catalog_text() == "fallback catalog"
