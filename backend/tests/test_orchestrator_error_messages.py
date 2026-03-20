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
    assert final_state["error"] == (
        "请求被上游模型服务拦截，请检查供应商风控或内容审核策略，或切换模型后重试。"
    )

    error_event = next(event for event in captured if event["type"] == "error")
    assert error_event["payload"]["content"] == (
        "辩论出错：请求被上游模型服务拦截，请检查供应商风控或内容审核策略，或切换模型后重试。"
    )

    persisted_error_entry = repository.persisted[-1]["dialogue_history"][-1]
    assert persisted_error_entry["content"] == (
        "系统运行出错：请求被上游模型服务拦截，请检查供应商风控或内容审核策略，或切换模型后重试。"
    )
    assert persisted_error_entry["agent_name"] == "系统"
