"""Tests for the runtime task manager."""

from __future__ import annotations

import asyncio

import pytest

from app.runtime.service import DebateRuntimeService


class _FakeRepository:
    def __init__(self) -> None:
        self.session = {
            "id": "abc123def456",
            "topic": "Test topic",
            "participants": ["proposer", "opposer"],
            "max_turns": 3,
            "agent_configs": {"judge": {"model": "gpt-4o"}},
        }

    async def get_session(self, session_id: str):
        if session_id == self.session["id"]:
            return dict(self.session)
        return None


class _FakeOrchestrator:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []
        self.cancelled = asyncio.Event()

    async def run_debate(self, **kwargs):
        self.calls.append(kwargs)
        try:
            await asyncio.sleep(60)
        except asyncio.CancelledError:
            self.cancelled.set()
            raise


class _FakeInterventionManager:
    def __init__(self) -> None:
        self.messages: list[tuple[str, str]] = []

    async def add_intervention(self, session_id: str, content: str) -> None:
        self.messages.append((session_id, content))


@pytest.mark.asyncio
async def test_runtime_service_manages_single_task_per_session():
    repository = _FakeRepository()
    orchestrator = _FakeOrchestrator()
    interventions = _FakeInterventionManager()
    service = DebateRuntimeService(
        repository=repository,
        orchestrator=orchestrator,
        intervention_manager=interventions,
    )

    started = await service.start_session("abc123def456")
    assert started.started is True
    assert started.session is not None
    await asyncio.sleep(0)
    assert orchestrator.calls[0]["topic"] == "Test topic"

    duplicate = await service.start_session("abc123def456")
    assert duplicate.started is False
    assert duplicate.message == "This session is already running."

    is_running = await service.queue_intervention("abc123def456", "hello")
    assert is_running is True
    assert interventions.messages == [("abc123def456", "hello")]

    stopped = await service.stop_session("abc123def456")
    assert stopped is True

    await asyncio.sleep(0)
    assert orchestrator.cancelled.is_set()


@pytest.mark.asyncio
async def test_runtime_service_reports_missing_session():
    service = DebateRuntimeService(
        repository=_FakeRepository(),
        orchestrator=_FakeOrchestrator(),
        intervention_manager=_FakeInterventionManager(),
    )

    result = await service.start_session("missing")
    assert result.started is False
    assert result.message == "Session missing was not found."
