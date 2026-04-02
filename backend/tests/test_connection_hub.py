"""Tests for websocket connection hub behavior."""

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


@pytest.mark.asyncio
async def test_connection_hub_tracks_connections_and_broadcasts():
    hub = RuntimeBus()
    ws1 = _FakeWebSocket()
    ws2 = _FakeWebSocket()

    await hub.connect("session-1", ws1)
    await hub.connect("session-1", ws2)

    assert ws1.accepted is True
    assert ws2.accepted is True
    assert len(hub.get_connections("session-1")) == 2
    assert hub.active_sessions == ["session-1"]

    await hub.broadcast("session-1", {"type": "status"})

    assert ws1.messages == [{"type": "status"}]
    assert ws2.messages == [{"type": "status"}]


@pytest.mark.asyncio
async def test_connection_hub_drops_dead_connections_on_broadcast():
    hub = RuntimeBus()
    alive = _FakeWebSocket()
    dead = _FakeWebSocket(fail_send=True)

    await hub.connect("session-1", alive)
    await hub.connect("session-1", dead)

    await hub.broadcast("session-1", {"type": "system"})

    assert alive.messages == [{"type": "system"}]
    assert hub.get_connections("session-1") == [alive]
