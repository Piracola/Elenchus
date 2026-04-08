"""
Session CRUD service backed by file-based session storage.
"""

from __future__ import annotations

from typing import Any

from app.db.db_utils import _gen_id, _utcnow
from app.dependencies import get_agent_config_service
from app.models.schemas import SessionCreate, SessionStatus
from app.services.session_service_helpers import (
    effective_configs_for_mode,
    normalize_mode_config,
    sanitize_state_snapshot,
)
from app.services.session_service_serializers import (
    serialize_session_record,
    sync_session_round_results as sync_session_round_results_files,
)
from app.storage.session_files import (
    StoredSessionRecord,
    delete_session_storage,
    list_session_records,
    read_session_record,
    write_session_record,
)


def sync_session_round_results(record: StoredSessionRecord) -> None:
    """Materialize per-round JSON files for a stored session record."""
    sync_session_round_results_files(record)


async def create_session(body: SessionCreate) -> dict[str, Any]:
    """Create a new debate session in session.json storage."""
    now = _utcnow()
    agent_config_service = get_agent_config_service()
    debate_mode = body.debate_mode.value
    mode_config = normalize_mode_config(debate_mode, body.mode_config)
    team_config, jury_config, reasoning_config = effective_configs_for_mode(
        debate_mode,
        body.team_config.model_dump(),
        body.jury_config.model_dump(),
        body.reasoning_config.model_dump(),
    )
    agent_configs_for_storage = await agent_config_service.build_session_agent_configs(
        body.agent_configs,
        body.participants,
    )

    record = StoredSessionRecord(
        id=_gen_id(),
        topic=body.topic,
        debate_mode=debate_mode,
        mode_config=mode_config,
        participants=body.participants,
        max_turns=body.max_turns,
        current_turn=0,
        status=SessionStatus.PENDING.value,
        state_snapshot={
            "debate_mode": debate_mode,
            "mode_config": mode_config,
            "dialogue_history": [],
            "team_dialogue_history": [],
            "jury_dialogue_history": [],
            "judge_history": [],
            "shared_knowledge": [],
            "current_scores": {},
            "cumulative_scores": {},
            "search_context": [],
            "context_summary": "",
            "agent_configs": agent_configs_for_storage,
            "team_config": team_config,
            "jury_config": jury_config,
            "reasoning_config": reasoning_config,
            "mode_artifacts": [],
            "current_mode_report": None,
            "final_mode_report": None,
            "builtin_reference_docs": [],
        },
        created_at=now,
        updated_at=now,
    )
    write_session_record(record)
    return serialize_session_record(record)


async def list_sessions(
    offset: int = 0,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """List sessions with pagination."""
    records = list_session_records()[offset : offset + limit]
    return [
        {
            "id": record.id,
            "topic": record.topic,
            "debate_mode": record.debate_mode,
            "status": record.status,
            "current_turn": record.current_turn,
            "max_turns": record.max_turns,
            "created_at": record.created_at,
        }
        for record in records
    ]


async def count_sessions() -> int:
    """Return total session count for pagination."""
    return len(list_session_records())


async def get_session(session_id: str) -> dict[str, Any] | None:
    """Get a single session's full data."""
    record = read_session_record(session_id)
    if record is None:
        return None
    return serialize_session_record(record)


async def get_session_record(session_id: str) -> StoredSessionRecord | None:
    """Get the raw stored record for internal use."""
    return read_session_record(session_id)


async def update_session_state(
    session_id: str,
    *,
    current_turn: int | None = None,
    status: str | None = None,
    state_snapshot: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Partially update a session's mutable fields."""
    record = read_session_record(session_id)
    if record is None:
        return None

    if current_turn is not None:
        record.current_turn = current_turn
    if status is not None:
        record.status = status
    if state_snapshot is not None:
        sanitized_snapshot = sanitize_state_snapshot(state_snapshot)
        record.state_snapshot = sanitized_snapshot
        debate_mode = sanitized_snapshot.get("debate_mode")
        if isinstance(debate_mode, str) and debate_mode:
            record.debate_mode = debate_mode
        mode_config = sanitized_snapshot.get("mode_config")
        if isinstance(mode_config, dict):
            record.mode_config = mode_config

    record.updated_at = _utcnow()
    write_session_record(record)
    sync_session_round_results_files(record)
    return serialize_session_record(record)


async def delete_session(session_id: str) -> bool:
    """Delete a session."""
    record = read_session_record(session_id)
    if record is None:
        return False

    delete_session_storage(session_id)
    return True
