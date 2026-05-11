"""Tests for websocket transport edge cases."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import WebSocketDisconnect

from app.api import websocket as websocket_api
from app.middleware.rate_limit import RateLimitDecision


class _FakeClient:
    """Fake WebSocket client info."""
    def __init__(self, host: str = "127.0.0.1") -> None:
        self.host = host


class _FakeHeaders:
    """Minimal dict-like headers for _get_client_ip."""
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
        self.client = _FakeClient()
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
    ) -> bool:
        self.sent_messages.append(message)
        should_deliver = self._send_results.pop(0) if self._send_results else True
        if should_deliver:
            await websocket.send_json(message)
        return should_deliver

    async def emit(
        self,
        *,
        session_id: str,
        event_type: str,
        payload: dict[str, object] | None = None,
        source: str = "runtime",
        phase: str | None = None,
    ) -> None:
        self.emitted_messages.append(
            {
                "session_id": session_id,
                "type": event_type,
                "payload": payload or {},
                "source": source,
                "phase": phase,
            }
        )


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
    monkeypatch.setattr(
        websocket_api,
        "get_debate_runtime_service",
        lambda: SimpleNamespace(is_running=lambda _session_id: False),
    )

    await websocket_api.debate_ws(websocket, "abcdef123456")

    assert websocket.accepted is True
    assert [message["type"] for message in bus.sent_messages] == ["system", "pong"]
    assert websocket.sent == [bus.sent_messages[0]]
    assert bus.disconnected == [("abcdef123456", websocket)]


@pytest.mark.asyncio
async def test_websocket_requires_auth_token_when_global_auth_enabled(monkeypatch):
    bus = _FakeRuntimeBus()
    websocket = _FakeWebSocket([WebSocketDisconnect()])

    monkeypatch.setattr(websocket_api, "get_runtime_bus", lambda: bus)
    monkeypatch.setattr(
        websocket_api,
        "get_debate_runtime_service",
        lambda: SimpleNamespace(is_running=lambda _session_id: False),
    )
    monkeypatch.setattr(
        websocket_api,
        "get_settings",
        lambda: SimpleNamespace(
            demo=SimpleNamespace(enabled=False),
            auth=SimpleNamespace(enabled=True),
        ),
    )

    await websocket_api.debate_ws(websocket, "abcdef123456")

    assert websocket.accepted is True
    assert websocket.closed is True
    assert websocket.close_code == 4003
    assert websocket.close_reason == "Authentication required"
    assert bus.disconnected == []


@pytest.mark.asyncio
async def test_websocket_accepts_admin_cookie_when_global_auth_enabled(monkeypatch):
    bus = _FakeRuntimeBus()
    websocket = _FakeWebSocket([WebSocketDisconnect()], cookies={"elenchus_admin_token": "admin-token"})

    monkeypatch.setattr(websocket_api, "get_runtime_bus", lambda: bus)
    monkeypatch.setattr(
        websocket_api,
        "get_debate_runtime_service",
        lambda: SimpleNamespace(is_running=lambda _session_id: False),
    )
    monkeypatch.setattr(
        websocket_api,
        "get_settings",
        lambda: SimpleNamespace(
            demo=SimpleNamespace(enabled=False),
            auth=SimpleNamespace(enabled=True),
        ),
    )
    monkeypatch.setattr(websocket_api, "is_valid_admin_token", lambda token: token == "admin-token")

    await websocket_api.debate_ws(websocket, "abcdef123456")

    assert websocket.accepted is True
    assert websocket.closed is False
    assert bus.disconnected == [("abcdef123456", websocket)]


@pytest.mark.asyncio
async def test_websocket_demo_connect_policy_can_require_admin(monkeypatch):
    bus = _FakeRuntimeBus()
    websocket = _FakeWebSocket([WebSocketDisconnect()])

    monkeypatch.setattr(websocket_api, "get_runtime_bus", lambda: bus)
    monkeypatch.setattr(
        websocket_api,
        "get_debate_runtime_service",
        lambda: SimpleNamespace(is_running=lambda _session_id: False),
    )
    monkeypatch.setattr(
        websocket_api,
        "get_settings",
        lambda: SimpleNamespace(
            demo=SimpleNamespace(enabled=True),
            auth=SimpleNamespace(enabled=False),
        ),
    )
    monkeypatch.setattr(
        websocket_api,
        "is_demo_guest_capability",
        lambda capability: False if capability == "websocket.connect" else True,
    )

    await websocket_api.debate_ws(websocket, "abcdef123456")

    assert websocket.accepted is True
    assert websocket.closed is True
    assert websocket.close_code == 4003
    assert websocket.close_reason == websocket_api.DEMO_MODE_ADMIN_REQUIRED_MESSAGE
    assert bus.disconnected == []


@pytest.mark.asyncio
async def test_websocket_demo_action_policy_blocks_guest_when_capability_is_admin_only(monkeypatch):
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
        lambda: SimpleNamespace(
            start_session=_start_failed,
            is_running=lambda _session_id: False,
        ),
    )
    monkeypatch.setattr(
        websocket_api,
        "get_settings",
        lambda: SimpleNamespace(
            demo=SimpleNamespace(enabled=True),
            auth=SimpleNamespace(enabled=False),
        ),
    )
    monkeypatch.setattr(
        websocket_api,
        "get_demo_websocket_action_capability",
        lambda action: "websocket.action.start" if action == "start" else None,
    )
    monkeypatch.setattr(
        websocket_api,
        "is_demo_guest_capability",
        lambda capability: False if capability == "websocket.action.start" else True,
    )

    await websocket_api.debate_ws(websocket, "abcdef123456")

    assert websocket.accepted is True
    assert [message["type"] for message in websocket.sent] == ["system", "error"]
    assert websocket.sent[1]["payload"]["content"] == websocket_api.DEMO_MODE_ADMIN_REQUIRED_MESSAGE


@pytest.mark.asyncio
async def test_websocket_rate_limit_discards_current_message_before_replying(monkeypatch):
    bus = _FakeRuntimeBus()
    websocket = _FakeWebSocket(
        [
            {"action": "ping"},
            WebSocketDisconnect(),
        ]
    )

    rate_limit_calls = {"ws_message": 0}

    def _consume_rate_limit(_ip: str, bucket: str) -> SimpleNamespace:
        if bucket == "ws_connect":
            return RateLimitDecision(
                allowed=True,
                limit=10,
                remaining=9,
                retry_after=0,
                window_seconds=60,
            )
        if bucket == "ws_message":
            rate_limit_calls["ws_message"] += 1
            if rate_limit_calls["ws_message"] == 1:
                return RateLimitDecision(
                    allowed=False,
                    limit=20,
                    remaining=0,
                    retry_after=7,
                    window_seconds=10,
                )
            return RateLimitDecision(
                allowed=True,
                limit=20,
                remaining=19,
                retry_after=0,
                window_seconds=10,
            )
        return RateLimitDecision(
            allowed=True,
            limit=30,
            remaining=29,
            retry_after=0,
            window_seconds=60,
        )

    monkeypatch.setattr(websocket_api, "get_runtime_bus", lambda: bus)
    monkeypatch.setattr(
        websocket_api,
        "get_debate_runtime_service",
        lambda: SimpleNamespace(is_running=lambda _session_id: False),
    )
    monkeypatch.setattr(websocket_api, "consume_rate_limit", _consume_rate_limit)

    await websocket_api.debate_ws(websocket, "abcdef123456")

    assert websocket.accepted is True
    assert websocket.receive_calls == 2
    assert [message["type"] for message in websocket.sent] == ["system", "error"]
    assert websocket.sent[1]["payload"]["content"] == "Rate limited: please slow down."
    assert websocket.sent[1]["payload"]["rate_limit"] == {
        "limit": 20,
        "remaining": 0,
        "retry_after": 7,
        "window_seconds": 10,
    }


@pytest.mark.asyncio
async def test_websocket_connect_rate_limit_includes_retry_hint(monkeypatch):
    bus = _FakeRuntimeBus()
    websocket = _FakeWebSocket([])

    def _consume_rate_limit(_ip: str, bucket: str) -> SimpleNamespace:
        if bucket == "ws_connect":
            return RateLimitDecision(
                allowed=False,
                limit=10,
                remaining=0,
                retry_after=9,
                window_seconds=60,
            )
        return RateLimitDecision(
            allowed=True,
            limit=30,
            remaining=29,
            retry_after=0,
            window_seconds=60,
        )

    monkeypatch.setattr(websocket_api, "get_runtime_bus", lambda: bus)
    monkeypatch.setattr(
        websocket_api,
        "get_debate_runtime_service",
        lambda: SimpleNamespace(is_running=lambda _session_id: False),
    )
    monkeypatch.setattr(websocket_api, "consume_rate_limit", _consume_rate_limit)

    await websocket_api.debate_ws(websocket, "abcdef123456")

    assert websocket.accepted is True
    assert websocket.closed is True
    assert websocket.close_code == 4029
    assert websocket.close_reason == "Rate limited: too many connections. Retry after 9s."
