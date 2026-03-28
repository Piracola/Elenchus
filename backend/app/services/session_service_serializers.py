from __future__ import annotations

from typing import Any

from app.models.schemas import DebateMode
from app.services.session_service_helpers import (
    coerce_int,
    collect_round_timestamps,
    default_jury_config,
    default_reasoning_config,
    default_team_config,
    entries_for_turn,
    knowledge_for_turn,
    merge_dialogue_for_display,
    normalize_mode_config,
    sanitize_state_snapshot,
)
from app.storage.session_files import (
    StoredSessionRecord,
    delete_round_results_after,
    write_round_result,
)


def serialize_session_record(record: StoredSessionRecord) -> dict[str, Any]:
    snapshot = sanitize_state_snapshot(record.state_snapshot or {})
    dialogue_history = snapshot.get("dialogue_history", [])
    team_dialogue_history = snapshot.get("team_dialogue_history", [])
    jury_dialogue_history = snapshot.get("jury_dialogue_history", [])
    judge_history = snapshot.get("judge_history", [])
    debate_mode = str(
        snapshot.get("debate_mode")
        or record.debate_mode
        or DebateMode.STANDARD.value
    )
    return {
        "id": record.id,
        "topic": record.topic,
        "debate_mode": debate_mode,
        "mode_config": normalize_mode_config(
            debate_mode,
            snapshot.get("mode_config", record.mode_config),
        ),
        "participants": record.participants or ["proposer", "opposer"],
        "max_turns": record.max_turns,
        "current_turn": record.current_turn,
        "status": record.status,
        "created_at": record.created_at,
        "updated_at": record.updated_at,
        "dialogue_history": merge_dialogue_for_display(dialogue_history, judge_history),
        "team_dialogue_history": team_dialogue_history,
        "jury_dialogue_history": jury_dialogue_history,
        "shared_knowledge": snapshot.get("shared_knowledge", []),
        "current_scores": snapshot.get("current_scores", {}),
        "cumulative_scores": snapshot.get("cumulative_scores", {}),
        "agent_configs": snapshot.get("agent_configs", {}),
        "team_config": snapshot.get("team_config", default_team_config()),
        "jury_config": snapshot.get("jury_config", default_jury_config()),
        "reasoning_config": snapshot.get("reasoning_config", default_reasoning_config()),
        "mode_artifacts": snapshot.get("mode_artifacts", []),
        "current_mode_report": snapshot.get("current_mode_report"),
        "final_mode_report": snapshot.get("final_mode_report"),
    }


def completed_turn_count(record: StoredSessionRecord) -> int:
    snapshot = record.state_snapshot or {}
    last_node = str(snapshot.get("last_executed_node", "") or "")
    current_turn = max(0, int(record.current_turn or 0))
    max_turns = max(0, int(record.max_turns or 0))

    completed = min(current_turn, max_turns)
    if last_node in {"judge", "sophistry_observer"}:
        completed = min(current_turn + 1, max_turns)
    return completed


def mode_report_for_turn(snapshot: dict[str, Any], turn_index: int) -> dict[str, Any] | None:
    current_report = snapshot.get("current_mode_report")
    if isinstance(current_report, dict) and coerce_int(current_report.get("turn")) == turn_index:
        return current_report

    mode_artifacts = snapshot.get("mode_artifacts", [])
    if not isinstance(mode_artifacts, list):
        return None

    for artifact in reversed(mode_artifacts):
        if not isinstance(artifact, dict):
            continue
        if coerce_int(artifact.get("turn")) == turn_index:
            return artifact
    return None


def build_round_result(record: StoredSessionRecord, turn_index: int) -> dict[str, Any]:
    snapshot = sanitize_state_snapshot(record.state_snapshot or {})
    debate_entries = entries_for_turn(snapshot.get("dialogue_history", []), turn_index)
    judge_entries = entries_for_turn(snapshot.get("judge_history", []), turn_index)
    team_entries = entries_for_turn(snapshot.get("team_dialogue_history", []), turn_index)
    jury_entries = entries_for_turn(snapshot.get("jury_dialogue_history", []), turn_index)
    shared_knowledge = knowledge_for_turn(snapshot.get("shared_knowledge", []), turn_index)
    mode_report = mode_report_for_turn(snapshot, turn_index)
    timestamps = collect_round_timestamps(
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
        "debate_mode": record.debate_mode,
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
        "mode_report": mode_report,
    }


def sync_session_round_results(record: StoredSessionRecord) -> None:
    completed = completed_turn_count(record)
    delete_round_results_after(record.id, completed)
    for turn_index in range(completed):
        write_round_result(record.id, turn_index, build_round_result(record, turn_index))
