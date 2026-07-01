"""Tests for websocket transport edge cases."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import WebSocketDisconnect

from app.api import websocket as websocket_api


class _FakeHeaders:
    """Minimal dict-like WebSocket headers."""
    def __init__(self, data: dict[str, str] | None = None) -> None:
        self._data = {k.lower(): v for k, v in (data or {}).items()}

    def get(self, key: str, default: str | None = None) -> str | None:
        return self._data.get(key.lower(), default)


class _FakeQueryParams:
    def __init__(self, data: dict[str, str] | None = None) -> None:
        self._data = data or {}

    def get(self, key: str, default: str | None = None) -> str | None:
        return self._data.get(key, default)


class _FakeWebSocket:
    def __init__(
        self,
        messages: list[object],
        *,
        headers: dict[str, str] | None = None,
        query_params: dict[str, str] | None = None,
        cookies: dict[str, str] | None = None,
    ) -> None:
        self.accepted = False
        self.closed = False
        self.close_code: int | None = None
        self.close_reason: str | None = None
        self.receive_calls = 0
        self.sent: list[dict[str, object]] = []
        self._messages = iter(messages)
        self.headers = _FakeHeaders(headers)
        self.query_params = _FakeQueryParams(query_params)
        self.cookies = cookies or {}

    async def accept(self) -> None:
        self.accepted = True

    async def close(self, *, code: int, reason: str) -> None:
        self.closed = True
        self.close_code = code
        self.close_reason = reason

    async def receive_json(self) -> dict[str, object]:
        self.receive_calls += 1
        item = next(self._messages)
        if isinstance(item, Exception):
            raise item
        return item

    async def send_json(self, message: dict[str, object]) -> None:
        self.sent.append(message)


class _FakeRuntimeBus:
    def __init__(self, *, send_results: list[bool] | None = None) -> None:
        self.disconnected: list[tuple[str, _FakeWebSocket]] = []
        self.sent_messages: list[dict[str, object]] = []
        self.emitted_messages: list[dict[str, object]] = []
        self._send_results = list(send_results or [])
        self._seq = 0
        self.connected: list[tuple[str, _FakeWebSocket, str]] = []
        self.pending_buffers: dict[tuple[str, _FakeWebSocket], list[dict[str, object]]] = {}

    async def connect(self, run_id: str, websocket: _FakeWebSocket) -> None:
        await websocket.accept()

    async def register_pending_listener(
        self,
        run_id: str,
        websocket: _FakeWebSocket,
        *,
        accept: bool = True,
    ) -> None:
        if accept:
            await websocket.accept()
        self.connected.append((run_id, websocket, "pending"))
        self.pending_buffers[(run_id, websocket)] = []

    async def activate_pending_listener(
        self,
        run_id: str,
        websocket: _FakeWebSocket,
        *,
        replay_until_seq: int,
    ) -> list[dict[str, object]]:
        self.connected.append((run_id, websocket, "active"))
        return [
            dict(item)
            for item in self.pending_buffers.pop((run_id, websocket), [])
            if int(item.get("seq", -1) or -1) > replay_until_seq
        ]

    async def snapshot_latest_sequence(self, run_id: str) -> int:
        return self._seq

    def disconnect(self, run_id: str, websocket: _FakeWebSocket) -> None:
        self.disconnected.append((run_id, websocket))
        self.pending_buffers.pop((run_id, websocket), None)

    async def create_event(
        self,
        *,
        run_id: str,
        session_id: str,
        event_type: str,
        payload: dict[str, object] | None = None,
        source: str = "runtime",
        phase: str | None = None,
        persisted: bool = True,
    ) -> dict[str, object]:
        if persisted:
            self._seq += 1
        return {
            "run_id": run_id,
            "session_id": session_id,
            "seq": self._seq if persisted else -1,
            "type": event_type,
            "payload": payload or {},
            "source": source,
            "phase": phase,
        }

    async def send(
        self,
        run_id: str,
        websocket: _FakeWebSocket,
        message: dict[str, object],
    ) -> bool:
        self.sent_messages.append(message)
        should_deliver = self._send_results.pop(0) if self._send_results else True
        if should_deliver:
            await websocket.send_json(message)
        return should_deliver

    async def emit(
        self,
        *,
        run_id: str,
        session_id: str,
        event_type: str,
        payload: dict[str, object] | None = None,
        source: str = "runtime",
        phase: str | None = None,
        ) -> None:
        self._seq += 1
        event = {
            "run_id": run_id,
            "session_id": session_id,
            "seq": self._seq,
            "type": event_type,
            "payload": payload or {},
            "source": source,
            "phase": phase,
        }
        self.emitted_messages.append(event)
        for (buffer_run_id, _websocket), buffer in list(self.pending_buffers.items()):
            if buffer_run_id == run_id:
                buffer.append(dict(event))


def _run_record(run_id: str = "abcdef123456", session_id: str = "session12345") -> SimpleNamespace:
    return SimpleNamespace(id=run_id, session_id=session_id)


async def _get_run(run_id: str) -> SimpleNamespace:
    return _run_record(run_id)


async def _no_events(
    _run_id: str,
    after_seq: int = 0,
    up_to_seq: int | None = None,
) -> list[dict[str, object]]:
    return []


async def _one_replayed_event(
    run_id: str,
    after_seq: int = 0,
    up_to_seq: int | None = None,
) -> list[dict[str, object]]:
    return [
        {
            "run_id": run_id,
            "session_id": "session12345",
            "seq": after_seq + 1,
            "type": "status",
            "payload": {"content": "old"},
        }
    ]


@pytest.mark.asyncio
async def test_run_websocket_replays_persisted_events_before_live_connect(monkeypatch):
    bus = _FakeRuntimeBus()
    websocket = _FakeWebSocket(
        [
            WebSocketDisconnect(),
        ]
    )

    monkeypatch.setattr(websocket_api, "get_runtime_bus", lambda: bus)
    monkeypatch.setattr(websocket_api, "get_run", _get_run)
    monkeypatch.setattr(
        websocket_api,
        "get_debate_runtime_service",
        lambda: SimpleNamespace(is_running=lambda _run_id: False),
    )
    monkeypatch.setattr(websocket_api, "list_run_events", _one_replayed_event)

    await websocket_api.run_ws(websocket, "abcdef123456", after_seq=3)

    assert websocket.accepted is True
    assert len(websocket.sent) == 2
    assert websocket.sent[0]["seq"] == 4
    assert websocket.sent[0]["type"] == "status"
    assert websocket.sent[1]["type"] == "system"
    assert websocket.sent[1]["seq"] == -1
    assert bus.disconnected == [("abcdef123456", websocket)]


@pytest.mark.asyncio
async def test_running_run_sends_resume_status_on_connect(monkeypatch):
    bus = _FakeRuntimeBus()
    websocket = _FakeWebSocket([WebSocketDisconnect()])

    monkeypatch.setattr(websocket_api, "get_runtime_bus", lambda: bus)
    monkeypatch.setattr(websocket_api, "get_run", _get_run)
    monkeypatch.setattr(websocket_api, "list_run_events", _no_events)
    monkeypatch.setattr(
        websocket_api,
        "get_debate_runtime_service",
        lambda: SimpleNamespace(
            is_running=lambda run_id: run_id == "abcdef123456",
        ),
    )

    await websocket_api.run_ws(websocket, "abcdef123456")

    assert websocket.accepted is True
    assert len(websocket.sent) == 2
    assert websocket.sent[0]["type"] == "system"
    assert websocket.sent[0]["seq"] == -1
    assert websocket.sent[1]["type"] == "status"
    assert websocket.sent[1]["seq"] == -1
    assert websocket.sent[1]["phase"] == "processing"


@pytest.mark.asyncio
async def test_run_websocket_flushes_buffered_live_events_after_replay(monkeypatch):
    bus = _FakeRuntimeBus()
    bus._seq = 4
    websocket = _FakeWebSocket([WebSocketDisconnect()])

    async def replay_then_emit_live(run_id: str, after_seq: int = 0, up_to_seq: int | None = None):
        assert up_to_seq == 4
        await bus.emit(
            run_id=run_id,
            session_id="session12345",
            event_type="status",
            payload={"content": "live"},
            source="runtime.test",
            phase="processing",
        )
        return [
            {
                "run_id": run_id,
                "session_id": "session12345",
                "seq": 4,
                "type": "status",
                "payload": {"content": "replayed"},
                "source": "runtime.test",
                "phase": "processing",
            }
        ]

    monkeypatch.setattr(websocket_api, "get_runtime_bus", lambda: bus)
    monkeypatch.setattr(websocket_api, "get_run", _get_run)
    monkeypatch.setattr(
        websocket_api,
        "get_debate_runtime_service",
        lambda: SimpleNamespace(is_running=lambda _run_id: False),
    )
    monkeypatch.setattr(websocket_api, "list_run_events", replay_then_emit_live)

    await websocket_api.run_ws(websocket, "abcdef123456", after_seq=3)

    assert [message["seq"] for message in websocket.sent] == [4, 5, -1]
    assert [message["payload"].get("content") for message in websocket.sent] == [
        "replayed",
        "live",
        "Connected to run abcdef123456",
    ]
    assert bus.connected == [("abcdef123456", websocket, "pending"), ("abcdef123456", websocket, "active")]


@pytest.mark.asyncio
async def test_ping_send_failure_stops_processing_after_disconnect(monkeypatch):
    bus = _FakeRuntimeBus(send_results=[True, False])
    websocket = _FakeWebSocket(
        [
            {"action": "ping"},
            {"action": "ping"},
        ]
    )

    monkeypatch.setattr(websocket_api, "get_runtime_bus", lambda: bus)
    monkeypatch.setattr(websocket_api, "get_run", _get_run)
    monkeypatch.setattr(websocket_api, "list_run_events", _no_events)
    monkeypatch.setattr(
        websocket_api,
        "get_debate_runtime_service",
        lambda: SimpleNamespace(is_running=lambda _run_id: False),
    )

    await websocket_api.run_ws(websocket, "abcdef123456")

    assert websocket.accepted is True
    assert [message["type"] for message in bus.sent_messages] == ["system", "pong"]
    assert [message["seq"] for message in bus.sent_messages] == [-1, -1]
    assert websocket.sent == [bus.sent_messages[0]]
    assert bus.disconnected == [("abcdef123456", websocket)]
