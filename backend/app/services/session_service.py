"""
Session CRUD service backed by the async database layer.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.safe_invoke import normalize_model_text
from app.db.models import SessionRecord, _gen_id, _utcnow
from app.dependencies import get_agent_config_service
from app.models.schemas import SessionCreate, SessionStatus


def _sanitize_dialogue_history(dialogue_history: Any) -> list[dict[str, Any]]:
    if not isinstance(dialogue_history, list):
        return []

    sanitized: list[dict[str, Any]] = []
    for entry in dialogue_history:
        if not isinstance(entry, dict):
            continue

        normalized_entry = dict(entry)
        content = normalized_entry.get("content")
        if isinstance(content, str) and content:
            normalized_entry["content"] = normalize_model_text(content)
        sanitized.append(normalized_entry)

    return sanitized


def _sanitize_state_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
    sanitized = dict(snapshot)
    sanitized["dialogue_history"] = _sanitize_dialogue_history(
        sanitized.get("dialogue_history", [])
    )
    if "judge_history" in sanitized:
        sanitized["judge_history"] = _sanitize_dialogue_history(
            sanitized.get("judge_history", [])
        )
    if "recent_dialogue_history" in sanitized:
        sanitized["recent_dialogue_history"] = _sanitize_dialogue_history(
            sanitized.get("recent_dialogue_history", [])
        )
    return sanitized


def _parse_timestamp(value: Any) -> datetime:
    if not isinstance(value, str) or not value:
        return datetime.min.replace(tzinfo=timezone.utc)

    normalized = value
    if normalized.endswith("Z"):
        normalized = normalized[:-1]

    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return datetime.min.replace(tzinfo=timezone.utc)

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _merge_dialogue_for_display(
    dialogue_history: list[dict[str, Any]],
    judge_history: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    merged = [*dialogue_history, *judge_history]
    merged.sort(
        key=lambda entry: (
            _parse_timestamp(entry.get("timestamp")),
            1 if entry.get("role") == "judge" else 0,
        )
    )
    return merged


def _record_to_dict(record: SessionRecord) -> dict[str, Any]:
    snapshot = _sanitize_state_snapshot(record.state_snapshot or {})
    dialogue_history = snapshot.get("dialogue_history", [])
    judge_history = snapshot.get("judge_history", [])
    return {
        "id": record.id,
        "topic": record.topic,
        "participants": record.participants or ["proposer", "opposer"],
        "max_turns": record.max_turns,
        "current_turn": record.current_turn,
        "status": record.status,
        "created_at": record.created_at,
        "updated_at": record.updated_at,
        "dialogue_history": _merge_dialogue_for_display(dialogue_history, judge_history),
        "shared_knowledge": snapshot.get("shared_knowledge", []),
        "current_scores": snapshot.get("current_scores", {}),
        "cumulative_scores": snapshot.get("cumulative_scores", {}),
        "agent_configs": snapshot.get("agent_configs", {}),
    }


async def create_session(db: AsyncSession, body: SessionCreate) -> dict[str, Any]:
    """Create a new debate session in the database."""
    now = _utcnow()
    agent_config_service = get_agent_config_service()
    agent_configs_for_storage = await agent_config_service.build_session_agent_configs(
        body.agent_configs,
        body.participants,
    )

    record = SessionRecord(
        id=_gen_id(),
        topic=body.topic,
        participants=body.participants,
        max_turns=body.max_turns,
        current_turn=0,
        status=SessionStatus.PENDING.value,
        state_snapshot={
            "dialogue_history": [],
            "judge_history": [],
            "shared_knowledge": [],
            "current_scores": {},
            "cumulative_scores": {},
            "search_context": [],
            "context_summary": "",
            "agent_configs": agent_configs_for_storage,
        },
        created_at=now,
        updated_at=now,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return _record_to_dict(record)


async def list_sessions(
    db: AsyncSession,
    offset: int = 0,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """List sessions with pagination."""
    stmt = (
        select(SessionRecord)
        .order_by(SessionRecord.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(stmt)
    records = result.scalars().all()
    return [
        {
            "id": record.id,
            "topic": record.topic,
            "status": record.status,
            "current_turn": record.current_turn,
            "max_turns": record.max_turns,
            "created_at": record.created_at,
        }
        for record in records
    ]


async def count_sessions(db: AsyncSession) -> int:
    """Return total session count for pagination."""
    result = await db.execute(select(func.count()).select_from(SessionRecord))
    return result.scalar_one()


async def get_session(db: AsyncSession, session_id: str) -> dict[str, Any] | None:
    """Get a single session's full data."""
    record = await db.get(SessionRecord, session_id)
    if record is None:
        return None
    return _record_to_dict(record)


async def get_session_record(db: AsyncSession, session_id: str) -> SessionRecord | None:
    """Get the raw ORM record for internal use."""
    return await db.get(SessionRecord, session_id)


async def update_session_state(
    db: AsyncSession,
    session_id: str,
    *,
    current_turn: int | None = None,
    status: str | None = None,
    state_snapshot: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Partially update a session's mutable fields."""
    record = await db.get(SessionRecord, session_id)
    if record is None:
        return None

    if current_turn is not None:
        record.current_turn = current_turn
    if status is not None:
        record.status = status
    if state_snapshot is not None:
        record.state_snapshot = _sanitize_state_snapshot(state_snapshot)

    record.updated_at = _utcnow()
    await db.commit()
    await db.refresh(record)
    return _record_to_dict(record)


async def delete_session(db: AsyncSession, session_id: str) -> bool:
    """Delete a session."""
    record = await db.get(SessionRecord, session_id)
    if record is None:
        return False

    await db.delete(record)
    await db.commit()
    return True
