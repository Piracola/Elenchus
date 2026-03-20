"""
Session CRUD service backed by file-based session storage.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.agents.safe_invoke import normalize_model_text
from app.db.models import _gen_id, _utcnow
from app.dependencies import get_agent_config_service
from app.models.schemas import SessionCreate, SessionStatus
from app.storage.session_files import (
    StoredSessionRecord,
    delete_round_results_after,
    delete_session_storage,
    list_session_records,
    read_session_record,
    write_round_result,
    write_session_record,
)
from app.text_repair import repair_text_tree


def _default_team_config() -> dict[str, int]:
    return {
        "agents_per_team": 0,
        "discussion_rounds": 0,
    }


def _default_jury_config() -> dict[str, int]:
    return {
        "agents_per_jury": 0,
        "discussion_rounds": 0,
    }


def _default_reasoning_config() -> dict[str, bool]:
    return {
        "steelman_enabled": True,
        "counterfactual_enabled": True,
        "consensus_enabled": True,
    }


def _sanitize_dialogue_history(dialogue_history: Any) -> list[dict[str, Any]]:
    if not isinstance(dialogue_history, list):
        return []

    sanitized: list[dict[str, Any]] = []
    for entry in dialogue_history:
        if not isinstance(entry, dict):
            continue

        normalized_entry = repair_text_tree(dict(entry))
        content = normalized_entry.get("content")
        if isinstance(content, str) and content:
            normalized_entry["content"] = normalize_model_text(content)
        sanitized.append(normalized_entry)

    return sanitized


def _sanitize_state_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
    sanitized = repair_text_tree(dict(snapshot))
    sanitized["dialogue_history"] = _sanitize_dialogue_history(
        sanitized.get("dialogue_history", [])
    )
    if "team_dialogue_history" in sanitized:
        sanitized["team_dialogue_history"] = _sanitize_dialogue_history(
            sanitized.get("team_dialogue_history", [])
        )
    if "jury_dialogue_history" in sanitized:
        sanitized["jury_dialogue_history"] = _sanitize_dialogue_history(
            sanitized.get("jury_dialogue_history", [])
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

    normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
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


def _record_to_dict(record: StoredSessionRecord) -> dict[str, Any]:
    snapshot = _sanitize_state_snapshot(record.state_snapshot or {})
    dialogue_history = snapshot.get("dialogue_history", [])
    team_dialogue_history = snapshot.get("team_dialogue_history", [])
    jury_dialogue_history = snapshot.get("jury_dialogue_history", [])
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
        "team_dialogue_history": team_dialogue_history,
        "jury_dialogue_history": jury_dialogue_history,
        "shared_knowledge": snapshot.get("shared_knowledge", []),
        "current_scores": snapshot.get("current_scores", {}),
        "cumulative_scores": snapshot.get("cumulative_scores", {}),
        "agent_configs": snapshot.get("agent_configs", {}),
        "team_config": snapshot.get("team_config", _default_team_config()),
        "jury_config": snapshot.get("jury_config", _default_jury_config()),
        "reasoning_config": snapshot.get("reasoning_config", _default_reasoning_config()),
    }


def _coerce_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _entry_turn(entry: Any) -> int | None:
    if not isinstance(entry, dict):
        return None
    return _coerce_int(entry.get("turn"))


def _entries_for_turn(entries: Any, turn_index: int) -> list[dict[str, Any]]:
    if not isinstance(entries, list):
        return []
    return [
        entry
        for entry in entries
        if isinstance(entry, dict) and _entry_turn(entry) == turn_index
    ]


def _knowledge_for_turn(entries: Any, turn_index: int) -> list[dict[str, Any]]:
    if not isinstance(entries, list):
        return []

    selected: list[dict[str, Any]] = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        source_turn = _coerce_int(entry.get("source_turn"))
        if source_turn is None:
            source_turn = _coerce_int(entry.get("turn"))
        if source_turn == turn_index:
            selected.append(entry)
    return selected


def _collect_round_timestamps(*collections: list[dict[str, Any]]) -> list[datetime]:
    parsed: list[datetime] = []
    floor = datetime.min.replace(tzinfo=timezone.utc)
    for collection in collections:
        for entry in collection:
            timestamp = entry.get("timestamp") if isinstance(entry, dict) else None
            moment = _parse_timestamp(timestamp)
            if moment != floor:
                parsed.append(moment)
    return parsed


def _completed_turn_count(record: StoredSessionRecord) -> int:
    snapshot = record.state_snapshot or {}
    last_node = str(snapshot.get("last_executed_node", "") or "")
    current_turn = max(0, int(record.current_turn or 0))
    max_turns = max(0, int(record.max_turns or 0))

    completed = min(current_turn, max_turns)
    if last_node == "judge":
        completed = min(current_turn + 1, max_turns)
    return completed


def _build_round_result(record: StoredSessionRecord, turn_index: int) -> dict[str, Any]:
    snapshot = _sanitize_state_snapshot(record.state_snapshot or {})
    debate_entries = _entries_for_turn(snapshot.get("dialogue_history", []), turn_index)
    judge_entries = _entries_for_turn(snapshot.get("judge_history", []), turn_index)
    team_entries = _entries_for_turn(snapshot.get("team_dialogue_history", []), turn_index)
    jury_entries = _entries_for_turn(snapshot.get("jury_dialogue_history", []), turn_index)
    shared_knowledge = _knowledge_for_turn(snapshot.get("shared_knowledge", []), turn_index)
    timestamps = _collect_round_timestamps(
        debate_entries,
        judge_entries,
        team_entries,
        jury_entries,
    )

    scores_by_role: dict[str, Any] = {}
    for entry in judge_entries:
        target_role = str(entry.get("target_role", "") or "")
        scores = entry.get("scores")
        if target_role and isinstance(scores, dict):
            scores_by_role[target_role] = scores

    started_at = min(timestamps).isoformat() if timestamps else None
    completed_at = max(timestamps).isoformat() if timestamps else None
    return {
        "session_id": record.id,
        "topic": record.topic,
        "participants": record.participants or ["proposer", "opposer"],
        "turn": turn_index,
        "turn_number": turn_index + 1,
        "status": "completed",
        "started_at": started_at,
        "completed_at": completed_at,
        "debate": debate_entries,
        "judge": judge_entries,
        "team_discussion": team_entries,
        "jury_discussion": jury_entries,
        "shared_knowledge": shared_knowledge,
        "scores_by_role": scores_by_role,
    }


def _sync_round_results(record: StoredSessionRecord) -> None:
    completed_turn_count = _completed_turn_count(record)
    delete_round_results_after(record.id, completed_turn_count)
    for turn_index in range(completed_turn_count):
        write_round_result(record.id, turn_index, _build_round_result(record, turn_index))


async def create_session(_db: Any, body: SessionCreate) -> dict[str, Any]:
    """Create a new debate session in session.json storage."""
    now = _utcnow()
    agent_config_service = get_agent_config_service()
    agent_configs_for_storage = await agent_config_service.build_session_agent_configs(
        body.agent_configs,
        body.participants,
    )

    record = StoredSessionRecord(
        id=_gen_id(),
        topic=body.topic,
        participants=body.participants,
        max_turns=body.max_turns,
        current_turn=0,
        status=SessionStatus.PENDING.value,
        state_snapshot={
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
            "team_config": body.team_config.model_dump(),
            "jury_config": body.jury_config.model_dump(),
            "reasoning_config": body.reasoning_config.model_dump(),
        },
        created_at=now,
        updated_at=now,
    )
    write_session_record(record)
    return _record_to_dict(record)


async def list_sessions(
    _db: Any,
    offset: int = 0,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """List sessions with pagination."""
    records = list_session_records()[offset : offset + limit]
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


async def count_sessions(_db: Any) -> int:
    """Return total session count for pagination."""
    return len(list_session_records())


async def get_session(_db: Any, session_id: str) -> dict[str, Any] | None:
    """Get a single session's full data."""
    record = read_session_record(session_id)
    if record is None:
        return None
    return _record_to_dict(record)


async def get_session_record(_db: Any, session_id: str) -> StoredSessionRecord | None:
    """Get the raw stored record for internal use."""
    return read_session_record(session_id)


async def update_session_state(
    _db: Any,
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
        record.state_snapshot = _sanitize_state_snapshot(state_snapshot)

    record.updated_at = _utcnow()
    write_session_record(record)
    _sync_round_results(record)
    return _record_to_dict(record)


async def delete_session(_db: Any, session_id: str) -> bool:
    """Delete a session."""
    record = read_session_record(session_id)
    if record is None:
        return False

    delete_session_storage(session_id)
    return True
