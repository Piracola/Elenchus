"""Tests for proactive runtime status emission."""

from __future__ import annotations

from typing import Any

import pytest

from app.runtime.event_gateway import EventStreamGateway
from app.runtime.orchestrator import DebateOrchestrator


class _FakeRepository:
    async def build_initial_state(
        self,
        session_id: str,
        *,
        topic: str,
        participants: list[str] | None,
        max_turns: int,
        agent_configs: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return {
            "session_id": session_id,
            "topic": topic,
            "participants": participants or ["proposer", "opposer"],
            "max_turns": max_turns,
            "current_turn": 0,
            "current_speaker": "",
            "current_speaker_index": -1,
            "dialogue_history": [],
            "shared_knowledge": [],
            "messages": [],
            "current_scores": {},
            "cumulative_scores": {},
            "status": "in_progress",
            "agent_configs": agent_configs or {},
        }

    async def persist_state(self, _session_id: str, _state: dict[str, Any]) -> None:
        return None


class _FakeEngine:
    async def stream(self, initial_state: dict[str, Any]):
        session_id = initial_state["session_id"]

        yield {
            "session_id": session_id,
            "last_executed_node": "manage_context",
            "participants": initial_state["participants"],
            "max_turns": initial_state["max_turns"],
            "current_turn": 0,
            "current_speaker": "",
            "current_speaker_index": -1,
            "dialogue_history": [],
            "shared_knowledge": [],
            "messages": [],
            "current_scores": {},
            "cumulative_scores": {},
        }

        yield {
            "session_id": session_id,
            "last_executed_node": "set_speaker",
            "participants": initial_state["participants"],
            "max_turns": initial_state["max_turns"],
            "current_turn": 0,
            "current_speaker": "proposer",
            "current_speaker_index": 0,
            "dialogue_history": [],
            "shared_knowledge": [],
            "messages": [],
            "current_scores": {},
            "cumulative_scores": {},
        }

        yield {
            "session_id": session_id,
            "last_executed_node": "speaker",
            "participants": initial_state["participants"],
            "max_turns": initial_state["max_turns"],
            "current_turn": 0,
            "current_speaker": "proposer",
            "current_speaker_index": 0,
            "dialogue_history": [
                {
                    "role": "proposer",
                    "agent_name": "Proposer",
                    "content": "argument",
                    "timestamp": "2026-03-18T00:00:00Z",
                    "citations": [],
                }
            ],
            "shared_knowledge": [],
            "messages": [],
            "current_scores": {},
            "cumulative_scores": {},
        }


@pytest.mark.asyncio
async def test_orchestrator_preannounces_speaker_status_after_set_speaker():
    captured: list[dict[str, Any]] = []

    async def _sink(_session_id: str, event: dict[str, Any]) -> None:
        captured.append(event)

    gateway = EventStreamGateway(_sink)
    orchestrator = DebateOrchestrator(
        repository=_FakeRepository(),
        engine=_FakeEngine(),
        event_gateway=gateway,
    )

    await orchestrator.run_debate(
        "abc123def456",
        "Status timing test",
        participants=["proposer", "opposer"],
        max_turns=1,
    )

    status_nodes = [
        event["payload"]["node"]
        for event in captured
        if event.get("type") == "status" and isinstance(event.get("payload"), dict)
    ]
    assert status_nodes[:3] == ["manage_context", "set_speaker", "speaker"]
    assert status_nodes.count("manage_context") == 1
    assert status_nodes.count("speaker") == 1

    speaker_status_index = next(
        index
        for index, event in enumerate(captured)
        if event.get("type") == "status"
        and isinstance(event.get("payload"), dict)
        and event["payload"].get("node") == "speaker"
    )
    speech_start_index = next(
        index for index, event in enumerate(captured) if event.get("type") == "speech_start"
    )
    assert speaker_status_index < speech_start_index
