"""Tests for user-facing orchestrator error messages."""

from __future__ import annotations

from typing import Any

import pytest

from app.runtime.event_gateway import EventStreamGateway
from app.runtime.orchestrator import DebateOrchestrator


class _FakeRepository:
    def __init__(self) -> None:
        self.persisted: list[dict[str, Any]] = []

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

    async def persist_state(self, _session_id: str, state: dict[str, Any]) -> None:
        self.persisted.append(dict(state))


class _ExplodingEngine:
    async def stream(self, _initial_state: dict[str, Any]):
        raise RuntimeError("Your request was blocked.")
        yield {}


class _InitExplodingRepository(_FakeRepository):
    async def build_initial_state(
        self,
        session_id: str,
        *,
        topic: str,
        participants: list[str] | None,
        max_turns: int,
        agent_configs: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        raise FileNotFoundError("missing bundled resource")


@pytest.mark.asyncio
async def test_orchestrator_emits_clean_user_facing_error_messages():
    captured: list[dict[str, Any]] = []

    async def _sink(_session_id: str, event: dict[str, Any]) -> None:
        captured.append(event)

    repository = _FakeRepository()
    gateway = EventStreamGateway(_sink)
    orchestrator = DebateOrchestrator(
        repository=repository,
        engine=_ExplodingEngine(),
        event_gateway=gateway,
    )

    final_state = await orchestrator.run_debate(
        "abc123def456",
        "Blocked request test",
        participants=["proposer", "opposer"],
        max_turns=1,
    )

    assert final_state["status"] == "error"
    assert final_state["error"]
    assert final_state["error"] != "Your request was blocked."

    error_event = next(event for event in captured if event["type"] == "error")
    assert error_event["payload"]["content"]
    assert "Your request was blocked." not in str(error_event["payload"]["content"])

    persisted_error_entry = repository.persisted[-1]["dialogue_history"][-1]
    assert persisted_error_entry["role"] == "error"
    assert persisted_error_entry["content"]


@pytest.mark.asyncio
async def test_orchestrator_emits_error_when_initial_state_build_fails():
    captured: list[dict[str, Any]] = []

    async def _sink(_session_id: str, event: dict[str, Any]) -> None:
        captured.append(event)

    repository = _InitExplodingRepository()
    gateway = EventStreamGateway(_sink)
    orchestrator = DebateOrchestrator(
        repository=repository,
        engine=_ExplodingEngine(),
        event_gateway=gateway,
    )

    final_state = await orchestrator.run_debate(
        "abc123def456",
        "Initialization failure test",
        participants=["proposer", "opposer"],
        max_turns=1,
    )

    assert final_state["status"] == "error"
    assert "missing bundled resource" in final_state["error"]
    assert repository.persisted[-1]["status"] == "error"

    error_event = next(event for event in captured if event["type"] == "error")
    assert "missing bundled resource" in str(error_event["payload"]["content"])
