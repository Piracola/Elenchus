"""Tests for the unified runtime bus."""

from __future__ import annotations

import logging

import pytest

from app.runtime.bus import RuntimeBus


class _FakeWebSocket:
    def __init__(
        self,
        *,
        fail_send: bool = False,
        send_error: Exception | None = None,
    ) -> None:
        self.accepted = False
        self.fail_send = fail_send
        self.send_error = send_error
        self.messages: list[dict[str, object]] = []

    async def accept(self) -> None:
        self.accepted = True

    async def send_json(self, message: dict[str, object]) -> None:
        if self.send_error is not None:
            raise self.send_error
        if self.fail_send:
            raise RuntimeError("socket closed")
        self.messages.append(message)


class _Repository:
    def __init__(self) -> None:
        self.persisted: list[dict[str, object]] = []
        self.latest_by_run: dict[str, int] = {}

    async def get_latest_runtime_event_seq(self, run_id: str) -> int:
        if run_id == "resume123456":
            return max(4, self.latest_by_run.get(run_id, 0))
        return self.latest_by_run.get(run_id, 0)

    async def persist_runtime_event(self, event: dict[str, object]) -> dict[str, object]:
        persisted = dict(event)
        run_id = str(persisted.get("run_id", ""))
        self.latest_by_run[run_id] = max(
            self.latest_by_run.get(run_id, 0),
            int(persisted.get("seq", 0) or 0),
        )
        self.persisted.append(persisted)
        return persisted


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

    async def sink(run_id: str, message: dict[str, object]) -> None:
        captured.append((run_id, message))

    repository = _Repository()
    bus = RuntimeBus(sink, repository=repository)

    event = await bus.emit(
        run_id="resume123456",
        session_id="resume123456",
        event_type="status",
        payload={"content": "resumed"},
        source="test",
    )

    assert event["seq"] == 5
    assert repository.persisted[0]["event_id"] == event["event_id"]
    assert captured == [("resume123456", event)]


@pytest.mark.asyncio
async def test_runtime_bus_refreshes_sequence_when_repository_moves_ahead():
    captured: list[tuple[str, dict[str, object]]] = []

    async def sink(run_id: str, message: dict[str, object]) -> None:
        captured.append((run_id, message))

    repository = _Repository()
    bus = RuntimeBus(sink, repository=repository)

    first = await bus.emit(
        run_id="run123abcdef",
        session_id="session12345",
        event_type="status",
        payload={"content": "first"},
        source="test",
    )
    repository.latest_by_run["run123abcdef"] = 8
    second = await bus.emit(
        run_id="run123abcdef",
        session_id="session12345",
        event_type="status",
        payload={"content": "after direct ledger write"},
        source="test",
    )

    assert first["seq"] == 1
    assert second["seq"] == 9
    assert captured[-1][1]["seq"] == 9


@pytest.mark.asyncio
async def test_runtime_bus_does_not_advance_persisted_sequence_for_speech_tokens():
    captured: list[tuple[str, dict[str, object]]] = []

    async def sink(run_id: str, message: dict[str, object]) -> None:
        captured.append((run_id, message))

    repository = _Repository()
    bus = RuntimeBus(sink, repository=repository)

    first = await bus.emit(
        run_id="run123abcdef",
        session_id="session12345",
        event_type="status",
        payload={"content": "first"},
        source="test",
    )
    token = await bus.emit(
        run_id="run123abcdef",
        session_id="session12345",
        event_type="speech_token",
        payload={"token": "hello"},
        source="test",
    )
    second = await bus.emit(
        run_id="run123abcdef",
        session_id="session12345",
        event_type="status",
        payload={"content": "second"},
        source="test",
    )

    assert first["seq"] == 1
    assert token["seq"] == -1
    assert second["seq"] == 2
    assert [event["type"] for event in repository.persisted] == ["status", "status"]
    assert [message["seq"] for _, message in captured] == [1, -1, 2]


@pytest.mark.asyncio
async def test_runtime_bus_does_not_persist_transient_progress_events():
    captured: list[tuple[str, dict[str, object]]] = []

    async def sink(run_id: str, message: dict[str, object]) -> None:
        captured.append((run_id, message))

    repository = _Repository()
    bus = RuntimeBus(sink, repository=repository)

    heartbeat = await bus.emit(
        run_id="run123abcdef",
        session_id="session12345",
        event_type="status",
        payload={"content": "still working", "heartbeat": True, "elapsed_seconds": 3},
        source="runtime.node.judge.heartbeat",
    )
    speech_start = await bus.emit(
        run_id="run123abcdef",
        session_id="session12345",
        event_type="speech_start",
        payload={"role": "proposer"},
        source="runtime.node.speaker",
    )
    persisted = await bus.emit(
        run_id="run123abcdef",
        session_id="session12345",
        event_type="speech_end",
        payload={"role": "proposer", "content": "正式发言"},
        source="runtime.node.speaker",
    )

    assert heartbeat["seq"] == -1
    assert speech_start["seq"] == -1
    assert persisted["seq"] == 1
    assert [event["type"] for event in repository.persisted] == ["speech_end"]
    assert [message["seq"] for _, message in captured] == [-1, -1, 1]


@pytest.mark.asyncio
async def test_runtime_bus_repairs_mojibake_payloads_before_delivery():
    captured: list[tuple[str, dict[str, object]]] = []

    async def sink(run_id: str, message: dict[str, object]) -> None:
        captured.append((run_id, message))

    repository = _Repository()
    bus = RuntimeBus(sink, repository=repository)

    event = await bus.emit(
        run_id="session-1",
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


@pytest.mark.asyncio
async def test_runtime_bus_send_drops_closed_socket_without_warning(caplog):
    bus = RuntimeBus()
    closed = _FakeWebSocket(
        send_error=RuntimeError('Cannot call "send" once a close message has been sent.')
    )

    await bus.connect("session-1", closed)

    with caplog.at_level(logging.DEBUG, logger="app.runtime.bus"):
        delivered = await bus.send("session-1", closed, {"type": "pong"})

    assert delivered is False
    assert bus.get_connections("session-1") == []
    assert not [record for record in caplog.records if record.levelno >= logging.WARNING]


@pytest.mark.asyncio
async def test_runtime_bus_send_json_encodes_datetimes():
    from datetime import datetime, timezone

    bus = RuntimeBus()
    websocket = _FakeWebSocket()

    await bus.connect("session-1", websocket)
    delivered = await bus.send(
        "session-1",
        websocket,
        {"type": "status", "timestamp": datetime(2026, 7, 1, tzinfo=timezone.utc)},
    )

    assert delivered is True
    assert websocket.messages == [{"type": "status", "timestamp": "2026-07-01T00:00:00+00:00"}]
