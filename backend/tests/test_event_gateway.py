"""Tests for runtime event gateway sequencing and envelope schema."""

from __future__ import annotations

import pytest

from app.runtime.event_gateway import EventStreamGateway


@pytest.mark.asyncio
async def test_event_gateway_emits_sequenced_events():
    delivered: list[tuple[str, dict]] = []

    async def sink(session_id: str, message: dict) -> None:
        delivered.append((session_id, message))

    gateway = EventStreamGateway(sink)

    first = await gateway.emit(
        session_id="abc123def456",
        event_type="status",
        payload={"content": "step-1", "node": "manage_context"},
        phase="context",
        source="test",
    )
    second = await gateway.emit(
        session_id="abc123def456",
        event_type="status",
        payload={"content": "step-2", "node": "speaker"},
        phase="speaking",
        source="test",
    )

    assert first["seq"] == 1
    assert second["seq"] == 2
    assert first["type"] == "status"
    assert first["payload"]["content"] == "step-1"
    assert first["content"] == "step-1"
    assert second["payload"]["node"] == "speaker"
    assert len(delivered) == 2
    assert delivered[0][0] == "abc123def456"


@pytest.mark.asyncio
async def test_event_gateway_sequence_isolated_per_session():
    delivered: list[tuple[str, dict]] = []

    async def sink(session_id: str, message: dict) -> None:
        delivered.append((session_id, message))

    gateway = EventStreamGateway(sink)

    first_a = await gateway.create_event(
        session_id="aaaaaaaaaaaa",
        event_type="system",
        payload={"content": "A1"},
    )
    first_b = await gateway.create_event(
        session_id="bbbbbbbbbbbb",
        event_type="system",
        payload={"content": "B1"},
    )
    second_a = await gateway.create_event(
        session_id="aaaaaaaaaaaa",
        event_type="system",
        payload={"content": "A2"},
    )

    assert first_a["seq"] == 1
    assert first_b["seq"] == 1
    assert second_a["seq"] == 2
