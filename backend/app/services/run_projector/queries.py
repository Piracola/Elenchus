from __future__ import annotations

from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ledger import RunRecord, SessionDocumentRecord

from .documents import (
    BUILTIN_SOPHISTRY_DOCUMENT_ID,
    builtin_reference_doc,
    builtin_reference_entries,
    document_projection_entry,
)

async def latest_run(db: AsyncSession, session_id: str) -> RunRecord | None:
    result = await db.execute(
        select(RunRecord)
        .where(RunRecord.session_id == session_id)
        .order_by(desc(RunRecord.created_at))
        .limit(1)
    )
    return result.scalar_one_or_none()


async def document_projection_entries(
    db: AsyncSession,
    session_id: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    result = await db.execute(
        select(SessionDocumentRecord)
        .where(SessionDocumentRecord.session_id == session_id)
        .order_by(desc(SessionDocumentRecord.created_at))
    )
    knowledge: list[dict[str, Any]] = []
    builtin_docs: list[dict[str, Any]] = []
    for record in result.scalars():
        if record.id == BUILTIN_SOPHISTRY_DOCUMENT_ID:
            knowledge.extend(builtin_reference_entries(record))
            builtin_docs.append(builtin_reference_doc(record))
            continue
        entry = document_projection_entry(record)
        if entry is not None:
            knowledge.append(entry)
    return knowledge, builtin_docs
