"""Tests for persisted runtime event recording."""

from __future__ import annotations

import pytest

from app.models.schemas import SessionCreate
from app.services import run_service, runtime_event_service, session_service


def make_event(seq: int, *, run_id: str, session_id: str) -> dict[str, object]:
    return {
        "schema_version": "2026-03-17",
        "event_id": f"evt_{seq}",
        "run_id": run_id,
        "session_id": session_id,
        "seq": seq,
        "timestamp": f"2026-03-18T00:00:{seq:02d}+00:00",
        "source": "test.runtime",
        "type": "status",
        "phase": "processing",
        "payload": {"content": f"event-{seq}"},
    }


@pytest.mark.asyncio
async def test_runtime_event_history_reports_latest_sequence(db_session):
    session = await session_service.create_session(
        SessionCreate(topic="Runtime sequence"),
    )
    session_id = session["id"]
    created = await run_service.create_run(
        session_id,
        topic=session["topic"],
        participants=session["participants"],
        max_turns=session["max_turns"],
        agent_configs=session.get("agent_configs", {}),
    )
    run_id = created["run"]["id"]

    assert await runtime_event_service.get_latest_runtime_event_seq(run_id) == 0

    await runtime_event_service.create_runtime_event(make_event(7, run_id=run_id, session_id=session_id))
    await runtime_event_service.create_runtime_event(make_event(8, run_id=run_id, session_id=session_id))

    assert await runtime_event_service.get_latest_runtime_event_seq(run_id) == 8


@pytest.mark.asyncio
async def test_runtime_event_history_writes_sqlite_run_events(db_session):
    session = await session_service.create_session(
        SessionCreate(topic="Runtime ledger"),
    )
    session_id = session["id"]
    created = await run_service.create_run(
        session_id,
        topic=session["topic"],
        participants=session["participants"],
        max_turns=session["max_turns"],
        agent_configs=session.get("agent_configs", {}),
    )
    run_id = created["run"]["id"]

    await runtime_event_service.create_runtime_event(make_event(1, run_id=run_id, session_id=session_id))
    await runtime_event_service.create_runtime_event(make_event(2, run_id=run_id, session_id=session_id))

    events = await run_service.list_run_events(run_id)

    assert len(events) == 2
    first_event = events[0]
    second_event = events[1]
    assert first_event["seq"] == 1
    assert second_event["seq"] == 2
    assert first_event["run_id"] == run_id
    assert first_event["session_id"] == session_id


@pytest.mark.asyncio
async def test_runtime_event_history_skips_transient_progress_events(db_session):
    session = await session_service.create_session(
        SessionCreate(topic="Runtime transient events"),
    )
    session_id = session["id"]
    created = await run_service.create_run(
        session_id,
        topic=session["topic"],
        participants=session["participants"],
        max_turns=session["max_turns"],
        agent_configs=session.get("agent_configs", {}),
    )
    run_id = created["run"]["id"]

    event = make_event(1, run_id=run_id, session_id=session_id)
    event["source"] = "runtime.node.judge.heartbeat"
    event["payload"] = {"content": "still judging", "heartbeat": True}

    returned = await runtime_event_service.create_runtime_event(event)

    assert returned["seq"] == 1
    assert await run_service.list_run_events(run_id) == []
    assert await runtime_event_service.get_latest_runtime_event_seq(run_id) == 0


@pytest.mark.asyncio
async def test_delete_runtime_events_preserves_run_created_payload(db_session):
    session = await session_service.create_session(
        SessionCreate(topic="Clear runtime events"),
    )
    session_id = session["id"]
    created = await run_service.create_run(
        session_id,
        topic=session["topic"],
        participants=session["participants"],
        max_turns=session["max_turns"],
        agent_configs=session.get("agent_configs", {}),
    )
    run_id = created["run"]["id"]

    await runtime_event_service.create_runtime_event(make_event(1, run_id=run_id, session_id=session_id))
    await runtime_event_service.delete_runtime_events(run_id)

    assert await run_service.list_run_events(run_id) == []
    payload = await run_service.get_run_start_payload(run_id)
    assert payload is not None
    assert payload["topic"] == session["topic"]
