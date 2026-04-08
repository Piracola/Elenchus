"""Service layer for structured per-session reference-library entries."""

from __future__ import annotations

from typing import Any

from app.storage.reference_library import (
    delete_document_entries,
    list_reference_entries,
    read_document_entries,
)
from app.storage.session_documents import StoredSessionDocument
from app.storage.session_files import StoredSessionRecord

from app.services.reference.knowledge import remove_document_reference_knowledge
from app.services.reference.serializers import (
    reference_document_to_dict,
    reference_entry_to_dict,
)
from app.services.reference.workflow import preprocess_session_document


async def list_reference_library(
    session_id: str,
    *,
    documents: list[dict[str, Any]],
) -> dict[str, Any]:
    """Return the current structured reference-library payload for one session."""
    entries = [reference_entry_to_dict(entry) for entry in list_reference_entries(session_id)]
    return {
        "documents": documents,
        "entries": entries,
    }


async def delete_reference_library_for_document(
    *,
    session_record: StoredSessionRecord,
    document_id: str,
) -> None:
    """Delete structured reference entries and synced shared knowledge for one document."""
    delete_document_entries(session_record.id, document_id)
    remove_document_reference_knowledge(session_record.id, document_id=document_id)


async def get_reference_entries_for_document(
    session_id: str,
    document_id: str,
) -> list[dict[str, Any]]:
    """Return stored structured entries for one document."""
    return [
        reference_entry_to_dict(entry)
        for entry in read_document_entries(session_id, document_id)
    ]
