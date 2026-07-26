"""Tests for the runtime task manager."""

from __future__ import annotations

import asyncio

import pytest

from app.models.schemas import RunStatus, SessionCreate
from app.runtime.service import DebateRuntimeService
from app.services import run_service, session_service


class _FakeRepository:
    def __init__(self) -> None:
        self.session = {
            "id": "abc123def456",
            "topic": "Test topic",
            "participants": ["proposer", "opposer"],
            "max_turns": 3,
            "agent_configs": {"judge": {"model": "gpt-4o"}},
        }

    async def get_session_for_run(self, run_id: str):
        return dict(self.session)


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


@pytest.mark.asyncio
async def test_runtime_service_manages_single_task_per_run(db_session):
    session = await session_service.create_session(SessionCreate(topic="Test topic"))
    created = await run_service.create_run(
        session["id"],
        topic=session["topic"],
        participants=session["participants"],
        max_turns=session["max_turns"],
        agent_configs={"judge": {"model": "gpt-4o"}},
    )
    run_id = created["run"]["id"]
    repository = _FakeRepository()
    repository.session["id"] = session["id"]
    orchestrator = _FakeOrchestrator()
    service = DebateRuntimeService(
        repository=repository,
        orchestrator=orchestrator,
    )

    started = await service.start_run(run_id)
    assert started.started is True
    assert started.session is not None
    await asyncio.sleep(0)
    assert orchestrator.calls[0]["topic"] == "Test topic"
    assert orchestrator.calls[0]["run_id"] == run_id
    assert orchestrator.calls[0]["session_id"] == session["id"]

    duplicate = await service.start_run(run_id)
    assert duplicate.started is False
    assert duplicate.message == "This run is already running."

    interrupted = await service.interrupt_run(run_id)
    assert interrupted is True

    stopped = await service.stop_run(run_id)
    assert stopped is True

    await asyncio.sleep(0)
    assert orchestrator.cancelled.is_set()


@pytest.mark.asyncio
async def test_runtime_service_reports_missing_run(db_session):
    service = DebateRuntimeService(
        repository=_FakeRepository(),
        orchestrator=_FakeOrchestrator(),
    )

    result = await service.start_run("missing")
    assert result.started is False
    assert result.message == "Run missing was not found."


@pytest.mark.asyncio
async def test_runtime_service_resume_uses_existing_run(db_session):
    session = await session_service.create_session(SessionCreate(topic="Resume test"))
    created = await run_service.create_run(
        session["id"],
        topic=session["topic"],
        participants=session["participants"],
        max_turns=session["max_turns"],
        agent_configs={"judge": {"model": "gpt-4o"}},
    )
    run_id = created["run"]["id"]
    repository = _FakeRepository()
    repository.session["id"] = session["id"]
    orchestrator = _FakeOrchestrator()
    service = DebateRuntimeService(
        repository=repository,
        orchestrator=orchestrator,
    )

    started = await service.start_run(run_id)
    assert started.started is True
    await asyncio.sleep(0)

    resumed = await service.start_run(run_id)
    assert resumed.started is False
    assert resumed.message == "This run is already running."


@pytest.mark.asyncio
async def test_runtime_service_reconciles_stale_running_run_to_stalled(db_session):
    session = await session_service.create_session(SessionCreate(topic="Stale run"))
    created = await run_service.create_run(
        session["id"],
        topic=session["topic"],
        participants=session["participants"],
        max_turns=session["max_turns"],
        agent_configs={},
    )
    run_id = created["run"]["id"]
    await run_service.update_run_state(run_id, status=RunStatus.RUNNING.value)

    service = DebateRuntimeService(
        repository=_FakeRepository(),
        orchestrator=_FakeOrchestrator(),
    )

    summary = await service.reconcile_run_liveness(run_id)

    assert summary is not None
    assert summary["status"] == RunStatus.STALLED.value
    refreshed = await run_service.get_run(run_id)
    assert refreshed is not None
    assert refreshed.status == RunStatus.STALLED.value
