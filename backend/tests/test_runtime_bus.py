"""Tests for the unified runtime bus."""

from __future__ import annotations

import pytest

from app.runtime.bus import RuntimeBus


class _FakeWebSocket:
    def __init__(self, *, fail_send: bool = False) -> None:
        self.accepted = False
        self.fail_send = fail_send
        self.messages: list[dict[str, object]] = []

    async def accept(self) -> None:
        self.accepted = True

    async def send_json(self, message: dict[str, object]) -> None:
        if self.fail_send:
            raise RuntimeError("socket closed")
        self.messages.append(message)


class _Repository:
    def __init__(self) -> None:
        self.persisted: list[dict[str, object]] = []

    async def get_latest_runtime_event_seq(self, session_id: str) -> int:
        if session_id == "resume123456":
            return 4
        return 0

    async def persist_runtime_event(self, event: dict[str, object]) -> None:
        self.persisted.append(event)


@pytest.mark.asyncio
async def test_runtime_bus_broadcasts_to_live_connections():
    bus = RuntimeBus()
    alive = _FakeWebSocket()
    dead = _FakeWebSocket(fail_send=True)

    await bus.connect("session-1", alive)
    await bus.connect("session-1", dead)
    await bus.broadcast("session-1", {"type": "status"})

    assert alive.accepted is True
    assert dead.accepted is True
    assert alive.messages == [{"type": "status"}]
    assert bus.get_connections("session-1") == [alive]


@pytest.mark.asyncio
async def test_runtime_bus_sequences_and_persists_events():
    captured: list[tuple[str, dict[str, object]]] = []

    async def sink(session_id: str, message: dict[str, object]) -> None:
        captured.append((session_id, message))

    repository = _Repository()
    bus = RuntimeBus(sink, repository=repository)

    event = await bus.emit(
        session_id="resume123456",
        event_type="status",
        payload={"content": "resumed"},
        source="test",
    )

    assert event["seq"] == 5
    assert repository.persisted[0]["event_id"] == event["event_id"]
    assert captured == [("resume123456", event)]


@pytest.mark.asyncio
async def test_runtime_bus_repairs_mojibake_payloads_before_delivery():
    captured: list[tuple[str, dict[str, object]]] = []

    async def sink(session_id: str, message: dict[str, object]) -> None:
        captured.append((session_id, message))

    repository = _Repository()
    bus = RuntimeBus(sink, repository=repository)

    event = await bus.emit(
        session_id="session-1",
        event_type="error",
        payload={"content": "杈╄鍑洪敊: Your request was blocked."},
        source="test",
        phase="error",
    )

    expected = "辩论出错：请求被上游模型服务拦截，请检查供应商风控或内容审核策略，或切换模型后重试。"
    assert event["payload"]["content"] == expected
    assert repository.persisted[0]["payload"]["content"] == expected
    assert captured == [("session-1", event)]
