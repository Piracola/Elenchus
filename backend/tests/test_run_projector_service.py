"""Tests for rebuilding run projections from the SQLite ledger."""

from __future__ import annotations

import pytest

from app.models.ledger import RunProjectionRecord
from app.models.schemas import SessionCreate
from app.services import run_service, session_service


@pytest.mark.asyncio
async def test_run_projection_can_be_rebuilt_after_manual_deletion(db_session):
    session = await session_service.create_session(
        SessionCreate(topic="Projector rebuild"),
    )
    created = await run_service.create_run(
        session["id"],
        topic=session["topic"],
        participants=session["participants"],
        max_turns=session["max_turns"],
        agent_configs=session.get("agent_configs", {}),
    )
    run_id = created["run"]["id"]

    await run_service.append_run_event(
        run_id=run_id,
        session_id=session["id"],
        event_type="status",
        payload={"content": "working", "node": "manage_context"},
        source="test",
        phase="context",
    )

    async with run_service._ledger._session_factory() as db:  # noqa: SLF001
        projection = await db.get(RunProjectionRecord, run_id)
        if projection is not None:
            await db.delete(projection)
            await db.commit()

    rebuilt = await run_service.get_run_projection(run_id)
    assert rebuilt is not None
    assert rebuilt.projection["topic"] == session["topic"]
    assert rebuilt.projection["last_status_message"] == "working"
    assert rebuilt.projection["last_executed_node"] == "manage_context"


@pytest.mark.asyncio
async def test_snapshot_event_rebuilds_projection_after_manual_deletion(db_session):
    session = await session_service.create_session(
        SessionCreate(topic="Snapshot rebuild"),
    )
    created = await run_service.create_run(
        session["id"],
        topic=session["topic"],
        participants=session["participants"],
        max_turns=session["max_turns"],
        agent_configs=session.get("agent_configs", {}),
    )
    run_id = created["run"]["id"]

    await run_service.update_run_state(
        run_id,
        current_turn=1,
        status="in_progress",
        state_snapshot={
            "dialogue_history": [
                {
                    "role": "proposer",
                    "agent_name": "Proposer",
                    "content": "persisted by event",
                    "citations": [],
                    "timestamp": "2026-03-20T00:00:00Z",
                }
            ],
            "shared_knowledge": [{"type": "memo", "content": "ledger fact"}],
            "current_scores": {},
            "cumulative_scores": {},
            "agent_configs": {},
        },
    )

    async with run_service._ledger._session_factory() as db:  # noqa: SLF001
        projection = await db.get(RunProjectionRecord, run_id)
        if projection is not None:
            await db.delete(projection)
            await db.commit()

    rebuilt = await run_service.get_run_projection(run_id)

    assert rebuilt is not None
    assert rebuilt.projection["dialogue_history"][0]["content"] == "persisted by event"
    assert rebuilt.projection["shared_knowledge"] == [{"type": "memo", "content": "ledger fact"}]


@pytest.mark.asyncio
async def test_get_run_projection_uses_cached_projection(monkeypatch, db_session):
    session = await session_service.create_session(
        SessionCreate(topic="Cached projection"),
    )
    created = await run_service.create_run(
        session["id"],
        topic=session["topic"],
        participants=session["participants"],
        max_turns=session["max_turns"],
        agent_configs=session.get("agent_configs", {}),
    )
    run_id = created["run"]["id"]

    async def fail_rebuild(_run_id: str):
        raise AssertionError("cached projection should be returned without rebuilding")

    monkeypatch.setattr(run_service._projector, "rebuild_projection", fail_rebuild)  # noqa: SLF001

    cached = await run_service.get_run_projection(run_id)

    assert cached is not None
    assert cached.projection["topic"] == "Cached projection"


@pytest.mark.asyncio
async def test_internal_projection_snapshot_events_are_hidden_from_visible_stream(db_session):
    session = await session_service.create_session(
        SessionCreate(topic="Hidden snapshot"),
    )
    created = await run_service.create_run(
        session["id"],
        topic=session["topic"],
        participants=session["participants"],
        max_turns=session["max_turns"],
        agent_configs=session.get("agent_configs", {}),
    )
    run_id = created["run"]["id"]

    await run_service.update_run_state(
        run_id,
        state_snapshot={
            "dialogue_history": [],
            "shared_knowledge": [{"type": "memo", "content": "internal"}],
            "current_scores": {},
            "cumulative_scores": {},
            "agent_configs": {},
        },
    )
    await run_service.append_run_event(
        run_id=run_id,
        session_id=session["id"],
        event_type="status",
        payload={"content": "visible", "node": "speaker"},
        source="test",
    )

    events = await run_service.list_run_events(run_id)

    assert [event["type"] for event in events] == ["status"]
