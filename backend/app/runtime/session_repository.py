"""Runtime-oriented session loading and persistence helpers."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from app.agents.safe_invoke import normalize_model_text
from app.models.schemas import DebateMode
from app.services import runtime_event_service, session_service
from app.services.builtin_reference_service import ensure_builtin_mode_references
from app.text_repair import repair_text_tree

_SAFE_RESUME_NODES = {
    "",
    "manage_context",
    "advance_turn",
    "consensus",
    "sophistry_postmortem",
}




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


def _default_mode_config(debate_mode: str) -> dict[str, Any]:
    if debate_mode == DebateMode.SOPHISTRY_EXPERIMENT.value:
        return {
            "seed_reference_enabled": True,
            "observer_enabled": True,
            "artifact_detail_level": "full",
        }
    return {}


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


def _coerce_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _entry_turn(entry: Any) -> int | None:
    if not isinstance(entry, dict):
        return None
    return _coerce_int(entry.get("turn"))


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


def _rebuild_recent_dialogue_history(dialogue_history: list[dict[str, Any]], current_turn: int) -> list[dict[str, Any]]:
    recent_entries = [entry for entry in dialogue_history if _entry_turn(entry) == current_turn]
    return recent_entries or dialogue_history


def _recompute_cumulative_scores(judge_history: list[dict[str, Any]]) -> dict[str, dict[str, list[Any]]]:
    cumulative_scores: dict[str, dict[str, list[Any]]] = {}
    for entry in judge_history:
        if not isinstance(entry, dict):
            continue
        target_role = str(entry.get("target_role", "") or "")
        scores = entry.get("scores")
        if not target_role or not isinstance(scores, dict):
            continue
        role_scores = cumulative_scores.setdefault(target_role, {})
        for dimension, dimension_data in scores.items():
            if dimension in {"overall_comment", "module_scores", "comprehensive_score"}:
                continue
            if not isinstance(dimension_data, dict):
                continue
            score_value = dimension_data.get("score")
            if isinstance(score_value, (int, float)):
                role_scores.setdefault(str(dimension), []).append(score_value)
    return cumulative_scores


def _normalize_resumable_snapshot(
    session_snapshot: dict[str, Any],
    *,
    current_turn: int,
) -> dict[str, Any]:
    snapshot = repair_text_tree(deepcopy(session_snapshot))
    last_node = str(snapshot.get("last_executed_node", "") or "")
    if last_node in _SAFE_RESUME_NODES:
        return snapshot

    snapshot["dialogue_history"] = [
        entry
        for entry in _sanitize_dialogue_history(snapshot.get("dialogue_history", []))
        if _entry_turn(entry) != current_turn
    ]
    snapshot["team_dialogue_history"] = [
        entry
        for entry in _sanitize_dialogue_history(snapshot.get("team_dialogue_history", []))
        if _entry_turn(entry) != current_turn
    ]
    snapshot["jury_dialogue_history"] = [
        entry
        for entry in _sanitize_dialogue_history(snapshot.get("jury_dialogue_history", []))
        if _entry_turn(entry) != current_turn
    ]
    snapshot["judge_history"] = [
        entry
        for entry in _sanitize_dialogue_history(snapshot.get("judge_history", []))
        if _entry_turn(entry) != current_turn
    ]

    shared_knowledge = snapshot.get("shared_knowledge", [])
    if isinstance(shared_knowledge, list):
        current_turn_knowledge = {id(entry) for entry in _knowledge_for_turn(shared_knowledge, current_turn)}
        snapshot["shared_knowledge"] = [
            entry
            for entry in shared_knowledge
            if id(entry) not in current_turn_knowledge
        ]
    else:
        snapshot["shared_knowledge"] = []

    mode_artifacts = snapshot.get("mode_artifacts", [])
    if isinstance(mode_artifacts, list):
        snapshot["mode_artifacts"] = [
            artifact
            for artifact in mode_artifacts
            if _coerce_int(artifact.get("turn") if isinstance(artifact, dict) else None) != current_turn
        ]
    else:
        snapshot["mode_artifacts"] = []

    current_mode_report = snapshot.get("current_mode_report")
    if isinstance(current_mode_report, dict) and _coerce_int(current_mode_report.get("turn")) == current_turn:
        snapshot["current_mode_report"] = None

    snapshot["recent_dialogue_history"] = _rebuild_recent_dialogue_history(
        snapshot["dialogue_history"],
        current_turn,
    )
    snapshot["current_speaker"] = ""
    snapshot["current_speaker_index"] = -1
    snapshot["messages"] = []
    snapshot["current_team_discussion"] = []
    snapshot["current_team_summary"] = None
    snapshot["current_jury_discussion"] = []
    snapshot["current_jury_summary"] = None
    snapshot["current_scores"] = {}
    snapshot["cumulative_scores"] = _recompute_cumulative_scores(snapshot["judge_history"])
    snapshot["last_executed_node"] = "manage_context"
    snapshot["last_status_message"] = ""
    return snapshot


class SessionRuntimeRepository:
    """Load and persist runtime state without exposing storage details."""

    async def get_session(self, session_id: str) -> dict[str, Any] | None:
        return await session_service.get_session(None, session_id)

    async def build_initial_state(
        self,
        session_id: str,
        *,
        topic: str,
        participants: list[str] | None = None,
        max_turns: int = 5,
        agent_configs: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        record = await session_service.get_session_record(None, session_id)
        if record is not None:
            await ensure_builtin_mode_references(
                session_id,
                debate_mode=str(record.debate_mode or DebateMode.STANDARD.value),
                mode_config=record.mode_config or {},
            )
            record = await session_service.get_session_record(None, session_id)

        session_data = await session_service.get_session(None, session_id)

        if session_data is None:
            return None

        raw_snapshot = (record.state_snapshot or {}) if record is not None else {}
        session_snapshot = _normalize_resumable_snapshot(
            raw_snapshot,
            current_turn=int(session_data.get("current_turn", 0) or 0),
        )
        dialogue_history = _sanitize_dialogue_history(
            session_snapshot.get("dialogue_history", session_data.get("dialogue_history", []))
        )
        team_dialogue_history = _sanitize_dialogue_history(
            session_snapshot.get(
                "team_dialogue_history",
                session_data.get("team_dialogue_history", []),
            )
        )
        jury_dialogue_history = _sanitize_dialogue_history(
            session_snapshot.get(
                "jury_dialogue_history",
                session_data.get("jury_dialogue_history", []),
            )
        )
        judge_history = _sanitize_dialogue_history(session_snapshot.get("judge_history", []))
        recent_dialogue_history = _sanitize_dialogue_history(
            session_snapshot.get("recent_dialogue_history", dialogue_history)
        )
        team_config = session_snapshot.get(
            "team_config",
            session_data.get("team_config", _default_team_config()),
        )
        if not isinstance(team_config, dict):
            team_config = _default_team_config()
        jury_config = session_snapshot.get(
            "jury_config",
            session_data.get("jury_config", _default_jury_config()),
        )
        if not isinstance(jury_config, dict):
            jury_config = _default_jury_config()
        reasoning_config = session_snapshot.get(
            "reasoning_config",
            session_data.get("reasoning_config", _default_reasoning_config()),
        )
        if not isinstance(reasoning_config, dict):
            reasoning_config = _default_reasoning_config()
        debate_mode = str(
            session_data.get("debate_mode")
            or (record.debate_mode if record is not None else DebateMode.STANDARD.value)
            or DebateMode.STANDARD.value
        )
        mode_config = session_snapshot.get(
            "mode_config",
            session_data.get("mode_config", record.mode_config if record is not None else {}),
        )
        if not isinstance(mode_config, dict):
            mode_config = _default_mode_config(debate_mode)

        return repair_text_tree(
            {
                "session_id": session_id,
                "topic": topic,
                "debate_mode": debate_mode,
                "mode_config": mode_config,
                "participants": (
                    participants
                    if participants is not None
                    else session_data.get("participants", ["proposer", "opposer"])
                ),
                "current_turn": session_data.get("current_turn", 0),
                "max_turns": max_turns,
                "current_speaker": "",
                "current_speaker_index": -1,
                "dialogue_history": dialogue_history,
                "team_dialogue_history": team_dialogue_history,
                "jury_dialogue_history": jury_dialogue_history,
                "judge_history": judge_history,
                "recent_dialogue_history": recent_dialogue_history or dialogue_history,
                "compressed_history_count": int(
                    session_snapshot.get("compressed_history_count", 0) or 0
                ),
                "shared_knowledge": session_snapshot.get(
                    "shared_knowledge",
                    session_data.get("shared_knowledge", []),
                ),
                "messages": [],
                "current_scores": session_snapshot.get(
                    "current_scores",
                    session_data.get("current_scores", {}),
                ),
                "cumulative_scores": session_snapshot.get(
                    "cumulative_scores",
                    session_data.get("cumulative_scores", {}),
                ),
                "status": "in_progress",
                "error": None,
                "team_config": team_config,
                "jury_config": jury_config,
                "reasoning_config": reasoning_config,
                "mode_artifacts": session_snapshot.get("mode_artifacts", []),
                "current_mode_report": session_snapshot.get("current_mode_report"),
                "final_mode_report": session_snapshot.get("final_mode_report"),
                "builtin_reference_docs": session_snapshot.get("builtin_reference_docs", []),
                "current_team_discussion": [],
                "current_team_summary": None,
                "current_jury_discussion": [],
                "current_jury_summary": None,
                "last_executed_node": str(session_snapshot.get("last_executed_node", "") or ""),
                "last_progress_at": str(session_snapshot.get("last_progress_at", "") or ""),
                "last_status_message": str(
                    session_snapshot.get("last_status_message", "") or ""
                ),
                "resume_count": int(session_snapshot.get("resume_count", 0) or 0),
                "interrupted_at": str(session_snapshot.get("interrupted_at", "") or "") or None,
                "agent_configs": (
                    agent_configs
                    if agent_configs is not None
                    else session_data.get("agent_configs", {})
                ),
            }
        )

    async def persist_state(self, session_id: str, state: dict[str, Any]) -> None:
        agent_configs = state.get("agent_configs", {})
        agent_configs_for_storage = {
            role: {key: value for key, value in cfg.items() if key != "api_key"}
            for role, cfg in agent_configs.items()
        }

        await session_service.update_session_state(
            None,
            session_id,
            current_turn=state.get("current_turn", 0),
            status=state.get("status", "in_progress"),
            state_snapshot={
                "debate_mode": state.get("debate_mode", DebateMode.STANDARD.value),
                "mode_config": state.get(
                    "mode_config",
                    _default_mode_config(str(state.get("debate_mode", DebateMode.STANDARD.value))),
                ),
                "dialogue_history": state.get("dialogue_history", []),
                "team_dialogue_history": state.get("team_dialogue_history", []),
                "jury_dialogue_history": state.get("jury_dialogue_history", []),
                "judge_history": state.get("judge_history", []),
                "recent_dialogue_history": state.get("recent_dialogue_history", []),
                "compressed_history_count": state.get("compressed_history_count", 0),
                "shared_knowledge": state.get("shared_knowledge", []),
                "current_scores": state.get("current_scores", {}),
                "cumulative_scores": state.get("cumulative_scores", {}),
                "agent_configs": agent_configs_for_storage,
                "team_config": state.get("team_config", _default_team_config()),
                "jury_config": state.get("jury_config", _default_jury_config()),
                "reasoning_config": state.get("reasoning_config", _default_reasoning_config()),
                "mode_artifacts": state.get("mode_artifacts", []),
                "current_mode_report": state.get("current_mode_report"),
                "final_mode_report": state.get("final_mode_report"),
                "builtin_reference_docs": state.get("builtin_reference_docs", []),
                "last_executed_node": state.get("last_executed_node", ""),
                "last_progress_at": state.get("last_progress_at", ""),
                "last_status_message": state.get("last_status_message", ""),
                "resume_count": state.get("resume_count", 0),
                "interrupted_at": state.get("interrupted_at"),
            },
        )

    async def persist_runtime_event(self, event: dict[str, Any]) -> None:
        session_id = str(event.get("session_id", "") or "")
        if not session_id:
            return

        await runtime_event_service.create_runtime_event(None, event)

    async def get_latest_runtime_event_seq(self, session_id: str) -> int:
        return await runtime_event_service.get_latest_runtime_event_seq(None, session_id)

    async def load_runtime_events(
        self,
        session_id: str,
        *,
        before_seq: int | None = None,
        limit: int = 200,
    ) -> dict[str, Any]:
        return await runtime_event_service.list_runtime_events(
            None,
            session_id,
            before_seq=before_seq,
            limit=limit,
        )
