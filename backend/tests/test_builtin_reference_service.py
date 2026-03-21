"""Tests for deterministic built-in reference seeding."""

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import session_service
from app.services.builtin_reference_service import (
    BUILTIN_SOPHISTRY_DOCUMENT_ID,
    ensure_builtin_mode_references,
)
from app.models.schemas import SessionCreate
from app.storage.reference_library import read_document_entries
from app.storage.session_documents import read_document_record
from app.storage.session_files import read_session_record


@pytest.mark.asyncio
async def test_ensure_builtin_mode_references_seeds_once_and_syncs_snapshot(
    db_session: AsyncSession,
):
    created = await session_service.create_session(
        db_session,
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

    document = read_document_record(created["id"], BUILTIN_SOPHISTRY_DOCUMENT_ID)
    entries = read_document_entries(created["id"], BUILTIN_SOPHISTRY_DOCUMENT_ID)
    record = read_session_record(created["id"])

    assert document is not None
    assert entries
    assert record is not None

    snapshot = record.state_snapshot or {}
    builtin_docs = snapshot.get("builtin_reference_docs", [])
    shared_knowledge = snapshot.get("shared_knowledge", [])

    assert len([item for item in builtin_docs if item.get("document_id") == BUILTIN_SOPHISTRY_DOCUMENT_ID]) == 1
    assert any(item.get("document_id") == BUILTIN_SOPHISTRY_DOCUMENT_ID for item in shared_knowledge)
    assert {entry.entry_type for entry in entries} >= {"reference_summary", "reference_term"}
