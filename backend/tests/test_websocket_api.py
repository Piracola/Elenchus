"""Tests for websocket transport edge cases."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import WebSocketDisconnect

from app.api import websocket as websocket_api


class _FakeWebSocket:
    def __init__(self, messages: list[object]) -> None:
        self.accepted = False
        self.closed = False
        self.close_code: int | None = None
        self.close_reason: str | None = None
        self.sent: list[dict[str, object]] = []
        self._messages = iter(messages)

    async def accept(self) -> None:
        self.accepted = True

    async def close(self, *, code: int, reason: str) -> None:
        self.closed = True
        self.close_code = code
        self.close_reason = reason

    async def receive_json(self) -> dict[str, object]:
        item = next(self._messages)
        if isinstance(item, Exception):
            raise item
        return item

    async def send_json(self, message: dict[str, object]) -> None:
        self.sent.append(message)


class _FakeRuntimeBus:
    def __init__(self) -> None:
        self.disconnected: list[tuple[str, _FakeWebSocket]] = []
        self._seq = 0

    async def connect(self, session_id: str, websocket: _FakeWebSocket) -> None:
        await websocket.accept()

    def disconnect(self, session_id: str, websocket: _FakeWebSocket) -> None:
        self.disconnected.append((session_id, websocket))

    async def create_event(
        self,
        *,
        session_id: str,
        event_type: str,
        payload: dict[str, object] | None = None,
        source: str = "runtime",
        phase: str | None = None,
    ) -> dict[str, object]:
        self._seq += 1
        return {
            "session_id": session_id,
            "seq": self._seq,
            "type": event_type,
            "payload": payload or {},
            "source": source,
            "phase": phase,
        }

    async def send(
        self,
        session_id: str,
        websocket: _FakeWebSocket,
        message: dict[str, object],
    ) -> None:
        await websocket.send_json(message)


async def _start_failed(_session_id: str) -> SimpleNamespace:
    return SimpleNamespace(
        started=False,
        message="Failed to start session cleanly.",
        session=None,
    )


@pytest.mark.asyncio
async def test_start_failure_sends_error_event_over_runtime_bus(monkeypatch):
    bus = _FakeRuntimeBus()
    websocket = _FakeWebSocket(
        [
            {"action": "start"},
            WebSocketDisconnect(),
        ]
    )

    monkeypatch.setattr(websocket_api, "get_runtime_bus", lambda: bus)
    monkeypatch.setattr(
        websocket_api,
        "get_debate_runtime_service",
        lambda: SimpleNamespace(start_session=_start_failed, is_running=lambda _session_id: False),
    )

    await websocket_api.debate_ws(websocket, "abcdef123456")

    assert websocket.accepted is True
    assert len(websocket.sent) == 2
    assert websocket.sent[0]["type"] == "system"
    assert websocket.sent[1]["type"] == "error"
    assert websocket.sent[1]["payload"] == {"content": "Failed to start session cleanly."}
    assert bus.disconnected == [("abcdef123456", websocket)]


@pytest.mark.asyncio
async def test_running_session_sends_resume_status_on_connect(monkeypatch):
    bus = _FakeRuntimeBus()
    websocket = _FakeWebSocket([WebSocketDisconnect()])

    monkeypatch.setattr(websocket_api, "get_runtime_bus", lambda: bus)
    monkeypatch.setattr(
        websocket_api,
        "get_debate_runtime_service",
        lambda: SimpleNamespace(
            start_session=_start_failed,
            is_running=lambda session_id: session_id == "abcdef123456",
        ),
    )

    await websocket_api.debate_ws(websocket, "abcdef123456")

    assert websocket.accepted is True
    assert len(websocket.sent) == 2
    assert websocket.sent[0]["type"] == "system"
    assert websocket.sent[1]["type"] == "status"
    assert websocket.sent[1]["phase"] == "processing"
