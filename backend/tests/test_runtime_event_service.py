"""Tests for persisted runtime event recording."""

from __future__ import annotations

import json

import pytest

from app.models.schemas import SessionCreate
from app.runtime_paths import get_runtime_paths
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
