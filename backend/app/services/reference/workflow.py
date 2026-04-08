from __future__ import annotations

from dataclasses import replace
from typing import Any

from app.agents.reference_preprocessor import build_reference_entries, preprocess_reference_document
from app.storage.reference_library import delete_document_entries, write_document_entries
from app.storage.session_documents import StoredSessionDocument, write_document_record
from app.storage.session_files import StoredSessionRecord

from app.services.reference.knowledge import (
    remove_document_reference_knowledge,
    replace_document_reference_knowledge,
)
from app.services.reference.serializers import (
    build_stored_reference_entries,
    reference_document_to_dict,
    reference_entry_to_dict,
)


async def preprocess_session_document(
    *,
    session_record: StoredSessionRecord,
    document_record: StoredSessionDocument,
) -> dict[str, Any]:
    processing_document = replace(
        document_record,
        status="processing",
        error_message=None,
        updated_at=document_record.updated_at,
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
        stored_entries = build_stored_reference_entries(
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
        )
        write_document_record(updated_document)
        replace_document_reference_knowledge(
            document_record.session_id,
            document_id=document_record.id,
            document_filename=document_record.filename,
            entries=stored_entries,
        )
        return {
            "document": reference_document_to_dict(updated_document),
            "entries": [reference_entry_to_dict(entry) for entry in stored_entries],
        }
    except Exception as exc:
        failed_document = replace(
            document_record,
            status="failed",
            error_message=str(exc),
        )
        write_document_record(failed_document)
        delete_document_entries(document_record.session_id, document_record.id)
        remove_document_reference_knowledge(document_record.session_id, document_id=document_record.id)
        return {
            "document": reference_document_to_dict(failed_document),
            "entries": [],
        }
