"""Persistence helpers for runtime event history."""

from __future__ import annotations

from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import RuntimeEventRecord
from app.text_repair import repair_text_tree


def _record_to_dict(record: RuntimeEventRecord) -> dict[str, Any]:
    return {
        "schema_version": record.schema_version,
        "event_id": record.event_id,
        "session_id": record.session_id,
        "seq": record.seq,
        "timestamp": record.timestamp,
        "source": record.source,
        "type": record.event_type,
        "phase": record.phase,
        "payload": repair_text_tree(record.payload or {}),
    }


async def create_runtime_event(
    db: AsyncSession,
    event: dict[str, Any],
) -> dict[str, Any]:
    """Persist a single runtime event envelope."""
    payload = repair_text_tree(event.get("payload"))
    record = RuntimeEventRecord(
        event_id=str(event.get("event_id", "")),
        session_id=str(event.get("session_id", "")),
        schema_version=str(event.get("schema_version", "legacy")),
        seq=int(event.get("seq", -1) or -1),
        timestamp=str(event.get("timestamp", "")),
        source=str(event.get("source", "runtime")),
        event_type=str(event.get("type", "system")),
        phase=str(event.get("phase")) if event.get("phase") is not None else None,
        payload=payload if isinstance(payload, dict) else {},
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return _record_to_dict(record)


async def get_latest_runtime_event_seq(db: AsyncSession, session_id: str) -> int:
    """Return the max persisted sequence for a session, or 0 when empty."""
    stmt = select(func.max(RuntimeEventRecord.seq)).where(
        RuntimeEventRecord.session_id == session_id
    )
    result = await db.execute(stmt)
    value = result.scalar_one_or_none()
    return int(value or 0)


async def count_runtime_events(db: AsyncSession, session_id: str) -> int:
    """Return total persisted runtime event count for a session."""
    stmt = select(func.count()).select_from(RuntimeEventRecord).where(
        RuntimeEventRecord.session_id == session_id
    )
    result = await db.execute(stmt)
    return int(result.scalar_one() or 0)


async def list_runtime_events(
    db: AsyncSession,
    session_id: str,
    *,
    before_seq: int | None = None,
    limit: int = 200,
) -> dict[str, Any]:
    """Return one history page, ordered ascending by sequence."""
    stmt = select(RuntimeEventRecord).where(RuntimeEventRecord.session_id == session_id)
    if before_seq is not None:
        stmt = stmt.where(RuntimeEventRecord.seq < before_seq)

    stmt = stmt.order_by(RuntimeEventRecord.seq.desc()).limit(limit + 1)
    result = await db.execute(stmt)
    records = result.scalars().all()
    has_more = len(records) > limit
    selected = records[:limit]
    selected.reverse()

    total = await count_runtime_events(db, session_id)
    next_before_seq = selected[0].seq if has_more and selected else None
    return {
        "events": [_record_to_dict(record) for record in selected],
        "total": total,
        "limit": limit,
        "has_more": has_more,
        "next_before_seq": next_before_seq,
    }


async def list_all_runtime_events(
    db: AsyncSession,
    session_id: str,
) -> list[dict[str, Any]]:
    """Return the full persisted runtime history ordered by sequence ascending."""
    stmt = (
        select(RuntimeEventRecord)
        .where(RuntimeEventRecord.session_id == session_id)
        .order_by(RuntimeEventRecord.seq.asc())
    )
    result = await db.execute(stmt)
    records = result.scalars().all()
    return [_record_to_dict(record) for record in records]


async def delete_runtime_events(db: AsyncSession, session_id: str) -> None:
    """Delete all persisted runtime events for a session."""
    await db.execute(
        delete(RuntimeEventRecord).where(RuntimeEventRecord.session_id == session_id)
    )
    await db.commit()
