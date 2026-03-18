"""Runtime-oriented session loading and persistence helpers."""

from __future__ import annotations

from typing import Any

from app.agents.safe_invoke import normalize_model_text
from app.db.database import get_session_factory
from app.services import runtime_event_service, session_service


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


class SessionRuntimeRepository:
    """Load and persist runtime state without exposing ORM details."""

    async def get_session(self, session_id: str) -> dict[str, Any] | None:
        factory = get_session_factory()
        async with factory() as db:
            return await session_service.get_session(db, session_id)

    async def build_initial_state(
        self,
        session_id: str,
        *,
        topic: str,
        participants: list[str] | None = None,
        max_turns: int = 5,
        agent_configs: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        factory = get_session_factory()
        async with factory() as db:
            session_data = await session_service.get_session(db, session_id)
            record = await session_service.get_session_record(db, session_id)

        if session_data is None:
            return None

        session_snapshot = (record.state_snapshot or {}) if record is not None else {}
        dialogue_history = _sanitize_dialogue_history(
            session_snapshot.get("dialogue_history", session_data.get("dialogue_history", []))
        )
        judge_history = _sanitize_dialogue_history(session_snapshot.get("judge_history", []))
        recent_dialogue_history = _sanitize_dialogue_history(
            session_snapshot.get("recent_dialogue_history", dialogue_history)
        )

        return {
            "session_id": session_id,
            "topic": topic,
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
            "judge_history": judge_history,
            "recent_dialogue_history": recent_dialogue_history or dialogue_history,
            "compressed_history_count": int(session_snapshot.get("compressed_history_count", 0) or 0),
            "shared_knowledge": session_data.get("shared_knowledge", []),
            "messages": [],
            "current_scores": session_data.get("current_scores", {}),
            "cumulative_scores": session_data.get("cumulative_scores", {}),
            "status": "in_progress",
            "error": None,
            "agent_configs": (
                agent_configs
                if agent_configs is not None
                else session_data.get("agent_configs", {})
            ),
        }

    async def persist_state(self, session_id: str, state: dict[str, Any]) -> None:
        agent_configs = state.get("agent_configs", {})
        agent_configs_for_storage = {
            role: {key: value for key, value in cfg.items() if key != "api_key"}
            for role, cfg in agent_configs.items()
        }

        factory = get_session_factory()
        async with factory() as db:
            await session_service.update_session_state(
                db,
                session_id,
                current_turn=state.get("current_turn", 0),
                status=state.get("status", "in_progress"),
                state_snapshot={
                    "dialogue_history": state.get("dialogue_history", []),
                    "judge_history": state.get("judge_history", []),
                    "recent_dialogue_history": state.get("recent_dialogue_history", []),
                    "compressed_history_count": state.get("compressed_history_count", 0),
                    "shared_knowledge": state.get("shared_knowledge", []),
                    "current_scores": state.get("current_scores", {}),
                    "cumulative_scores": state.get("cumulative_scores", {}),
                    "agent_configs": agent_configs_for_storage,
                },
            )

    async def persist_runtime_event(self, event: dict[str, Any]) -> None:
        session_id = str(event.get("session_id", "") or "")
        if not session_id:
            return

        factory = get_session_factory()
        async with factory() as db:
            await runtime_event_service.create_runtime_event(db, event)

    async def get_latest_runtime_event_seq(self, session_id: str) -> int:
        factory = get_session_factory()
        async with factory() as db:
            return await runtime_event_service.get_latest_runtime_event_seq(db, session_id)

    async def load_runtime_events(
        self,
        session_id: str,
        *,
        before_seq: int | None = None,
        limit: int = 200,
    ) -> dict[str, Any]:
        factory = get_session_factory()
        async with factory() as db:
            return await runtime_event_service.list_runtime_events(
                db,
                session_id,
                before_seq=before_seq,
                limit=limit,
            )
