"""Runtime-oriented session loading and persistence helpers."""

from __future__ import annotations

from typing import Any

from app.models.schemas import DebateMode
from app.services import runtime_event_service, session_service
from app.services.builtin_reference_service import ensure_builtin_mode_references
from app.text_repair import repair_text_tree

from .session_defaults import default_jury_config, default_mode_config, default_reasoning_config, default_team_config
from .session_dialogue_helpers import sanitize_dialogue_history
from .session_snapshot_normalizer import normalize_resumable_snapshot


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
        session_snapshot = normalize_resumable_snapshot(
            raw_snapshot,
            current_turn=int(session_data.get("current_turn", 0) or 0),
        )
        dialogue_history = sanitize_dialogue_history(
            session_snapshot.get("dialogue_history", session_data.get("dialogue_history", []))
        )
        team_dialogue_history = sanitize_dialogue_history(
            session_snapshot.get(
                "team_dialogue_history",
                session_data.get("team_dialogue_history", []),
            )
        )
        jury_dialogue_history = sanitize_dialogue_history(
            session_snapshot.get(
                "jury_dialogue_history",
                session_data.get("jury_dialogue_history", []),
            )
        )
        judge_history = sanitize_dialogue_history(session_snapshot.get("judge_history", []))
        recent_dialogue_history = sanitize_dialogue_history(
            session_snapshot.get("recent_dialogue_history", dialogue_history)
        )
        team_config = session_snapshot.get(
            "team_config",
            session_data.get("team_config", default_team_config()),
        )
        if not isinstance(team_config, dict):
            team_config = default_team_config()
        jury_config = session_snapshot.get(
            "jury_config",
            session_data.get("jury_config", default_jury_config()),
        )
        if not isinstance(jury_config, dict):
            jury_config = default_jury_config()
        reasoning_config = session_snapshot.get(
            "reasoning_config",
            session_data.get("reasoning_config", default_reasoning_config()),
        )
        if not isinstance(reasoning_config, dict):
            reasoning_config = default_reasoning_config()
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
            mode_config = default_mode_config(debate_mode)

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
                    default_mode_config(str(state.get("debate_mode", DebateMode.STANDARD.value))),
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
                "team_config": state.get("team_config", default_team_config()),
                "jury_config": state.get("jury_config", default_jury_config()),
                "reasoning_config": state.get("reasoning_config", default_reasoning_config()),
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