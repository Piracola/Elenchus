"""
Session CRUD service — async database operations for debate sessions.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.safe_invoke import normalize_model_text
from app.db.models import SessionRecord, _gen_id, _utcnow
from app.models.schemas import SessionCreate, SessionStatus
from app.dependencies import get_provider_service


# ── Helpers ──────────────────────────────────────────────────────

def _record_to_dict(record: SessionRecord) -> dict[str, Any]:
    """Convert a DB record to a dict suitable for SessionResponse."""
    snapshot = _sanitize_state_snapshot(record.state_snapshot or {})
    return {
        "id": record.id,
        "topic": record.topic,
        "participants": record.participants or ["proposer", "opposer"],
        "max_turns": record.max_turns,
        "current_turn": record.current_turn,
        "status": record.status,
        "created_at": record.created_at,
        "updated_at": record.updated_at,
        "dialogue_history": snapshot.get("dialogue_history", []),
        "shared_knowledge": snapshot.get("shared_knowledge", []),
        "current_scores": snapshot.get("current_scores", {}),
        "cumulative_scores": snapshot.get("cumulative_scores", {}),
        "agent_configs": snapshot.get("agent_configs", {}),
    }


def _sanitize_dialogue_history(dialogue_history: Any) -> list[dict[str, Any]]:
    """Normalize malformed provider payloads embedded in stored dialogue history."""
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
    """Return a snapshot safe to persist and safe to send to the frontend."""
    sanitized = dict(snapshot)
    sanitized["dialogue_history"] = _sanitize_dialogue_history(
        sanitized.get("dialogue_history", [])
    )
    return sanitized


# ── CRUD Operations ─────────────────────────────────────────────

async def create_session(
    db: AsyncSession,
    body: SessionCreate,
    owner_id: str | None = None,
) -> dict[str, Any]:
    """Create a new debate session in the database."""
    now = _utcnow()
    provider_service = get_provider_service()
    agent_configs = body.agent_configs or {}

    # Resolve api_key from provider store for each agent config.
    # Frontend sends provider_id; backend looks up the real key.
    all_providers = {p["id"]: p for p in await provider_service.list_configs_raw()}
    for role, cfg in list(agent_configs.items()):
        pid = cfg.get("provider_id")
        if pid and pid in all_providers:
            provider = all_providers[pid]
            cfg["api_key"] = provider.get("api_key", "")
            cfg["api_base_url"] = cfg.get("api_base_url") or provider.get("api_base_url", "")
            cfg["provider_type"] = cfg.get("provider_type") or provider.get("provider_type", "openai")
        # Strip provider_id from persisted config — it's a lookup key, not runtime data
        cfg.pop("provider_id", None)

    default_provider = await provider_service.get_default_config()

    roles_needed = set(body.participants + ["judge", "fact_checker"])
    for role in roles_needed:
        if role not in agent_configs and default_provider:
            default_model = default_provider.models[0] if default_provider.models else ""
            # Look up the real api_key from the raw provider data
            raw = all_providers.get(default_provider.id, {})
            agent_configs[role] = {
                "model": default_model,
                "provider_type": default_provider.provider_type,
                "api_key": raw.get("api_key", ""),
                "api_base_url": default_provider.api_base_url,
            }

    # Strip api_key before persisting to database — preserve provider store encryption
    agent_configs_for_storage = {
        role: {k: v for k, v in cfg.items() if k != "api_key"}
        for role, cfg in agent_configs.items()
    }

    record = SessionRecord(
        id=_gen_id(),
        topic=body.topic,
        participants=body.participants,
        max_turns=body.max_turns,
        current_turn=0,
        status=SessionStatus.PENDING.value,
        owner_id=owner_id,
        state_snapshot={
            "dialogue_history": [],
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
    owner_id: str | None = None,
) -> list[dict[str, Any]]:
    """List sessions with pagination (lightweight info only)."""
    stmt = select(SessionRecord)

    # Filter by owner if specified
    if owner_id is not None:
        stmt = stmt.where(SessionRecord.owner_id == owner_id)

    stmt = stmt.order_by(SessionRecord.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    records = result.scalars().all()
    return [
        {
            "id": r.id,
            "topic": r.topic,
            "status": r.status,
            "current_turn": r.current_turn,
            "max_turns": r.max_turns,
            "created_at": r.created_at,
        }
        for r in records
    ]


async def count_sessions(db: AsyncSession, owner_id: str | None = None) -> int:
    """Return total session count for pagination."""
    from sqlalchemy import func, select as sa_select
    stmt = sa_select(func.count()).select_from(SessionRecord)

    # Filter by owner if specified
    if owner_id is not None:
        stmt = stmt.where(SessionRecord.owner_id == owner_id)

    result = await db.execute(stmt)
    return result.scalar_one()


async def get_session(
    db: AsyncSession,
    session_id: str,
    owner_id: str | None = None,
) -> dict[str, Any] | None:
    """Get a single session's full data. Returns None if not found."""
    record = await db.get(SessionRecord, session_id)
    if record is None:
        return None

    # Check ownership if owner_id is specified
    if owner_id is not None and record.owner_id != owner_id:
        return None

    return _record_to_dict(record)


async def get_session_record(db: AsyncSession, session_id: str) -> SessionRecord | None:
    """Get the raw ORM record (for internal use / state updates)."""
    return await db.get(SessionRecord, session_id)


async def update_session_state(
    db: AsyncSession,
    session_id: str,
    *,
    current_turn: int | None = None,
    status: str | None = None,
    state_snapshot: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """
    Partially update a session's mutable fields.
    Used by the LangGraph runner to persist state after each turn.
    """
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


async def delete_session(
    db: AsyncSession,
    session_id: str,
    owner_id: str | None = None,
) -> bool:
    """Delete a session. Returns True if deleted, False if not found."""
    record = await db.get(SessionRecord, session_id)
    if record is None:
        return False

    # Check ownership if owner_id is specified
    if owner_id is not None and record.owner_id != owner_id:
        return False

    await db.delete(record)
    await db.commit()
    return True
