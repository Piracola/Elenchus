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


class _FakeSophistryRepository(_FakeRepository):
    async def build_initial_state(
        self,
        session_id: str,
        *,
        topic: str,
        participants: list[str] | None,
        max_turns: int,
        agent_configs: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        state = await super().build_initial_state(
            session_id,
            topic=topic,
            participants=participants,
            max_turns=max_turns,
            agent_configs=agent_configs,
        )
        state["debate_mode"] = "sophistry_experiment"
        state["mode_config"] = {
            "seed_reference_enabled": True,
            "observer_enabled": True,
            "artifact_detail_level": "full",
        }
        state["mode_artifacts"] = []
        return state


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


class _FakeSophistryEngine:
    async def stream(self, initial_state: dict[str, Any]):
        session_id = initial_state["session_id"]

        yield {
            **initial_state,
            "session_id": session_id,
            "last_executed_node": "manage_context",
        }

        yield {
            **initial_state,
            "session_id": session_id,
            "last_executed_node": "set_speaker",
            "current_speaker": "proposer",
            "current_speaker_index": 0,
        }

        yield {
            **initial_state,
            "session_id": session_id,
            "last_executed_node": "sophistry_speaker",
            "current_speaker": "proposer",
            "current_speaker_index": 1,
            "speech_was_streamed": True,
            "dialogue_history": [
                {
                    "role": "proposer",
                    "agent_name": "Proposer",
                    "content": "argument",
                    "timestamp": "2026-03-18T00:00:00Z",
                    "citations": [],
                    "turn": 0,
                }
            ],
        }

        yield {
            **initial_state,
            "session_id": session_id,
            "last_executed_node": "sophistry_observer",
            "current_speaker": "",
            "current_speaker_index": -1,
            "dialogue_history": [
                {
                    "role": "proposer",
                    "agent_name": "Proposer",
                    "content": "argument",
                    "timestamp": "2026-03-18T00:00:00Z",
                    "citations": [],
                    "turn": 0,
                },
                {
                    "role": "sophistry_round_report",
                    "agent_name": "Observer",
                    "content": "report",
                    "timestamp": "2026-03-18T00:00:01Z",
                    "citations": [],
                    "turn": 0,
                },
            ],
            "mode_artifacts": [
                {
                    "type": "sophistry_round_report",
                    "title": "本轮观察",
                    "turn": 0,
                    "content": "report",
                    "created_at": "2026-03-18T00:00:01Z",
                }
            ],
            "current_mode_report": {
                "type": "sophistry_round_report",
                "title": "本轮观察",
                "turn": 0,
                "content": "report",
                "created_at": "2026-03-18T00:00:01Z",
            },
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


@pytest.mark.asyncio
async def test_orchestrator_emits_sophistry_status_sequence():
    captured: list[dict[str, Any]] = []

    async def _sink(_session_id: str, event: dict[str, Any]) -> None:
        captured.append(event)

    gateway = EventStreamGateway(_sink)
    orchestrator = DebateOrchestrator(
        repository=_FakeSophistryRepository(),
        engine=_FakeSophistryEngine(),
        event_gateway=gateway,
    )

    await orchestrator.run_debate(
        "abc123def456",
        "Sophistry timing test",
        participants=["proposer", "opposer"],
        max_turns=1,
    )

    status_nodes = [
        event["payload"]["node"]
        for event in captured
        if event.get("type") == "status" and isinstance(event.get("payload"), dict)
    ]
    assert status_nodes[:4] == [
        "manage_context",
        "set_speaker",
        "sophistry_speaker",
        "sophistry_observer",
    ]
