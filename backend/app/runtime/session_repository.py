"""Runtime-oriented session loading and persistence helpers."""

from __future__ import annotations

from typing import Any

from app.models.schemas import DebateMode
from app.services import run_service, runtime_event_service, session_service
from app.services.builtin_reference_service import ensure_builtin_mode_references
from app.text_repair import repair_text_tree

from .session_defaults import (
    default_mode_config,
    default_reasoning_config,
    default_speech_config,
)
from .session_dialogue_helpers import sanitize_dialogue_history
from .session_snapshot_normalizer import normalize_resumable_snapshot


class SessionRuntimeRepository:
    """Load and persist runtime state without exposing storage details."""

    async def get_session(self, session_id: str) -> dict[str, Any] | None:
        return await session_service.get_session(session_id)

    async def get_session_for_run(self, run_id: str) -> dict[str, Any] | None:
        return await run_service.get_session_for_run(run_id)

    async def build_initial_state(
        self,
        run_id: str,
        session_id: str,
        *,
        topic: str,
        participants: list[str] | None = None,
        max_turns: int = 5,
        agent_configs: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        record = await session_service.get_session_record(session_id)
        if record is not None:
            await ensure_builtin_mode_references(
                session_id,
                debate_mode=str(record.debate_mode or DebateMode.STANDARD.value),
                mode_config=record.mode_config or {},
            )
            record = await session_service.get_session_record(session_id)

        current_run = await run_service.get_run(run_id)
        if current_run is None or current_run.session_id != session_id or record is None:
            return None

        current_projection = await run_service.get_run_projection(run_id)
        raw_snapshot = (
            current_projection.projection
            if current_projection is not None and isinstance(current_projection.projection, dict)
            else {}
        )
        session_snapshot = normalize_resumable_snapshot(
            raw_snapshot,
            current_turn=int(current_run.current_turn or 0),
        )
        dialogue_history = sanitize_dialogue_history(
            session_snapshot.get("dialogue_history", [])
        )
        judge_history = sanitize_dialogue_history(session_snapshot.get("judge_history", []))
        reasoning_config = session_snapshot.get(
            "reasoning_config",
            record.reasoning_config or default_reasoning_config(),
        )
        if not isinstance(reasoning_config, dict):
            reasoning_config = default_reasoning_config()
        speech_config = session_snapshot.get(
            "speech_config",
            record.speech_config or default_speech_config(),
        )
        if not isinstance(speech_config, dict):
            speech_config = default_speech_config()
        debate_mode = str(
            session_snapshot.get("debate_mode")
            or record.debate_mode
            or DebateMode.STANDARD.value
        )
        mode_config = session_snapshot.get(
            "mode_config",
            record.mode_config or {},
        )
        if not isinstance(mode_config, dict):
            mode_config = default_mode_config(debate_mode)

        return repair_text_tree(
            {
                "session_id": session_id,
                "run_id": run_id,
                "topic": topic,
                "debate_mode": debate_mode,
                "mode_config": mode_config,
                "participants": (
                    participants
                    if participants is not None
                    else record.participants or ["proposer", "opposer"]
                ),
                "current_turn": current_run.current_turn or 0,
                "max_turns": max_turns,
                "current_speaker": str(session_snapshot.get("current_speaker", "") or ""),
                "current_speaker_index": int(session_snapshot.get("current_speaker_index", -1) or -1),
                "dialogue_history": dialogue_history,
                "judge_history": judge_history,
                "shared_knowledge": session_snapshot.get(
                    "shared_knowledge",
                    [],
                ),
                "messages": (
                    session_snapshot.get("messages", [])
                    if isinstance(session_snapshot.get("messages", []), list)
                    else []
                ),
                "current_scores": session_snapshot.get(
                    "current_scores",
                    {},
                ),
                "cumulative_scores": session_snapshot.get(
                    "cumulative_scores",
                    {},
                ),
                "status": "in_progress",
                "error": None,
                "reasoning_config": reasoning_config,
                "speech_config": speech_config,
                "mode_artifacts": session_snapshot.get("mode_artifacts", []),
                "current_mode_report": session_snapshot.get("current_mode_report"),
                "final_mode_report": session_snapshot.get("final_mode_report"),
                "builtin_reference_docs": session_snapshot.get("builtin_reference_docs", []),
                "last_executed_node": str(session_snapshot.get("last_executed_node", "") or ""),
                "last_progress_at": str(session_snapshot.get("last_progress_at", "") or ""),
                "last_status_message": str(
                    session_snapshot.get("last_status_message", "") or ""
                ),
                "resume_count": int(session_snapshot.get("resume_count", 0) or 0),
                "resume_next_node": str(session_snapshot.get("resume_next_node", "") or ""),
                "resume_origin_turn": int(session_snapshot.get("resume_origin_turn", -1) or -1),
                "interrupted_at": str(session_snapshot.get("interrupted_at", "") or "") or None,
                "agent_configs": (
                    agent_configs
                    if agent_configs is not None
                    else record.agent_configs or {}
                ),
            }
        )

    async def persist_state(self, run_id: str, session_id: str, state: dict[str, Any]) -> None:
        agent_configs = state.get("agent_configs", {})
        agent_configs_for_storage = {
            role: {key: value for key, value in cfg.items() if key != "api_key"}
            for role, cfg in agent_configs.items()
        }

        state_snapshot = {
            "run_id": run_id,
            "session_id": session_id,
            "topic": state.get("topic", ""),
            "participants": state.get("participants", []),
            "max_turns": state.get("max_turns", 0),
            "status": state.get("status", "in_progress"),
            "debate_mode": state.get("debate_mode", DebateMode.STANDARD.value),
            "mode_config": state.get(
                "mode_config",
                default_mode_config(str(state.get("debate_mode", DebateMode.STANDARD.value))),
            ),
            "dialogue_history": state.get("dialogue_history", []),
            "judge_history": state.get("judge_history", []),
            "shared_knowledge": state.get("shared_knowledge", []),
            "current_scores": state.get("current_scores", {}),
            "cumulative_scores": state.get("cumulative_scores", {}),
            "agent_configs": agent_configs_for_storage,
            "reasoning_config": state.get("reasoning_config", default_reasoning_config()),
            "speech_config": state.get("speech_config", default_speech_config()),
            "mode_artifacts": state.get("mode_artifacts", []),
            "current_mode_report": state.get("current_mode_report"),
            "final_mode_report": state.get("final_mode_report"),
            "builtin_reference_docs": state.get("builtin_reference_docs", []),
            "last_executed_node": state.get("last_executed_node", ""),
            "last_progress_at": state.get("last_progress_at", ""),
            "last_status_message": state.get("last_status_message", ""),
            "resume_count": state.get("resume_count", 0),
            "interrupted_at": state.get("interrupted_at"),
            "error": state.get("error"),
        }

        await run_service.update_run_state(
            run_id,
            current_turn=state.get("current_turn", 0),
            status=state.get("status", "in_progress"),
            state_snapshot=state_snapshot,
        )
        latest_seq = await run_service.get_latest_run_event_seq(run_id)
        await run_service.create_checkpoint(
            run_id=run_id,
            session_id=session_id,
            checkpoint_kind="node",
            node=str(state.get("last_executed_node", "") or ""),
            seq=latest_seq,
            turn=int(state.get("current_turn", 0) or 0),
            state_snapshot=state_snapshot,
        )

    async def persist_runtime_event(self, event: dict[str, Any]) -> dict[str, Any] | None:
        run_id = str(event.get("run_id", "") or "")
        session_id = str(event.get("session_id", "") or "")
        if not run_id or not session_id:
            return None

        return await runtime_event_service.create_runtime_event(event)

    async def get_latest_runtime_event_seq(self, run_id: str) -> int:
        return await runtime_event_service.get_latest_runtime_event_seq(run_id)
