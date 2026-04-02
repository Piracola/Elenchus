"""Tests for orchestrator memory event emission."""

from __future__ import annotations

from typing import Any

import pytest

from app.runtime.bus import RuntimeBus
from app.runtime.orchestrator import DebateOrchestrator


class _FakeRepository:
    def __init__(self) -> None:
        self.persisted: list[tuple[str, dict[str, Any]]] = []

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
            "dialogue_history": [],
            "shared_knowledge": [],
            "current_scores": {},
            "cumulative_scores": {},
            "status": "in_progress",
            "agent_configs": agent_configs or {},
        }

    async def persist_state(self, session_id: str, state: dict[str, Any]) -> None:
        self.persisted.append((session_id, dict(state)))


class _FakeEngine:
    async def stream(self, initial_state: dict[str, Any]):
        session_id = initial_state["session_id"]
        yield {
            "session_id": session_id,
            "last_executed_node": "tool_executor",
            "shared_knowledge": [
                {"type": "fact", "query": "AI", "result": "fact-result"},
            ],
            "current_turn": 0,
            "dialogue_history": [],
            "current_scores": {},
            "cumulative_scores": {},
        }
        # Same shared_knowledge again should not emit duplicate memory_write.
        yield {
            "session_id": session_id,
            "last_executed_node": "tool_executor",
            "shared_knowledge": [
                {"type": "fact", "query": "AI", "result": "fact-result"},
            ],
            "current_turn": 0,
            "dialogue_history": [],
            "current_scores": {},
            "cumulative_scores": {},
        }
        yield {
            "session_id": session_id,
            "last_executed_node": "manage_context",
            "shared_knowledge": [
                {"type": "fact", "query": "AI", "result": "fact-result"},
                {
                    "type": "memo",
                    "role": "proposer",
                    "agent_name": "Proposer",
                    "content": "memo-content",
                    "source_kind": "dialogue",
                    "source_timestamp": "2026-03-18T00:00:00+00:00",
                    "source_role": "proposer",
                    "source_agent_name": "Proposer",
                    "source_excerpt": "原始发言片段",
                },
            ],
            "current_turn": 1,
            "dialogue_history": [],
            "current_scores": {},
            "cumulative_scores": {},
        }


@pytest.mark.asyncio
async def test_orchestrator_emits_memory_write_events_once_per_new_item():
    captured: list[dict[str, Any]] = []

    async def _sink(_session_id: str, event: dict[str, Any]) -> None:
        captured.append(event)

    runtime_bus = RuntimeBus(_sink)
    repository = _FakeRepository()
    orchestrator = DebateOrchestrator(
        repository=repository,
        engine=_FakeEngine(),
        runtime_bus=runtime_bus,
    )

    await orchestrator.run_debate(
        "abc123def456",
        "Memory event test",
        participants=["proposer", "opposer"],
        max_turns=2,
    )

    memory_events = [event for event in captured if event.get("type") == "memory_write"]
    assert len(memory_events) == 2

    assert memory_events[0]["payload"]["memory_type"] == "fact"
    assert memory_events[0]["source"] == "runtime.node.tool_executor"

    assert memory_events[1]["payload"]["memory_type"] == "memo"
    assert memory_events[1]["source"] == "runtime.node.manage_context"
    assert memory_events[1]["payload"]["source_kind"] == "dialogue"
    assert memory_events[1]["payload"]["source_timestamp"] == "2026-03-18T00:00:00+00:00"
    assert memory_events[1]["payload"]["source_role"] == "proposer"
    assert memory_events[1]["payload"]["source_excerpt"] == "原始发言片段"
