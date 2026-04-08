"""Tests for persisted runtime event history paging."""

from __future__ import annotations

import json

import pytest

from app.runtime_paths import get_runtime_paths
from app.models.schemas import SessionCreate
from app.services import runtime_event_service, session_service


def make_event(seq: int, session_id: str = "session123abc") -> dict[str, object]:
    return {
        "schema_version": "2026-03-17",
        "event_id": f"evt_{seq}",
        "session_id": session_id,
        "seq": seq,
        "timestamp": f"2026-03-18T00:00:{seq:02d}+00:00",
        "source": "test.runtime",
        "type": "status",
        "phase": "processing",
        "payload": {"content": f"event-{seq}"},
    }


@pytest.mark.asyncio
async def test_runtime_event_history_returns_latest_page_then_older_page():
    session = await session_service.create_session(
        SessionCreate(topic="Runtime history paging"),
    )
    session_id = session["id"]

    for seq in range(1, 6):
        await runtime_event_service.create_runtime_event(make_event(seq, session_id))

    latest_page = await runtime_event_service.list_runtime_events(
        session_id,
        limit=2,
    )

    assert latest_page["total"] == 5
    assert latest_page["has_more"] is True
    assert latest_page["next_before_seq"] == 4
    assert [event["seq"] for event in latest_page["events"]] == [4, 5]

    older_page = await runtime_event_service.list_runtime_events(
        session_id,
        before_seq=latest_page["next_before_seq"],
        limit=2,
    )

    assert older_page["total"] == 5
    assert older_page["has_more"] is True
    assert older_page["next_before_seq"] == 2
    assert [event["seq"] for event in older_page["events"]] == [2, 3]


@pytest.mark.asyncio
async def test_runtime_event_history_reports_latest_sequence():
    session = await session_service.create_session(
        SessionCreate(topic="Runtime sequence"),
    )
    session_id = session["id"]

    assert await runtime_event_service.get_latest_runtime_event_seq(session_id) == 0

    await runtime_event_service.create_runtime_event(make_event(7, session_id))
    await runtime_event_service.create_runtime_event(make_event(8, session_id))

    assert await runtime_event_service.get_latest_runtime_event_seq(session_id) == 8


@pytest.mark.asyncio
async def test_runtime_event_history_can_return_full_persisted_list():
    session = await session_service.create_session(
        SessionCreate(topic="Runtime full export"),
    )
    session_id = session["id"]

    for seq in range(1, 4):
        await runtime_event_service.create_runtime_event(make_event(seq, session_id))

    events = await runtime_event_service.list_all_runtime_events(session_id)

    assert [event["seq"] for event in events] == [1, 2, 3]
    assert events[0]["event_id"] == "evt_1"
    assert events[-1]["event_id"] == "evt_3"


@pytest.mark.asyncio
async def test_runtime_event_history_writes_jsonl_file():
    session = await session_service.create_session(
        SessionCreate(topic="Runtime jsonl"),
    )
    session_id = session["id"]

    await runtime_event_service.create_runtime_event(make_event(1, session_id))
    await runtime_event_service.create_runtime_event(make_event(2, session_id))

    events_path = get_runtime_paths().sessions_dir / session_id / "events.jsonl"
    assert events_path.exists()

    lines = [line for line in events_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    assert len(lines) == 2

    first_event = json.loads(lines[0])
    second_event = json.loads(lines[1])
    assert first_event["seq"] == 1
    assert second_event["seq"] == 2
