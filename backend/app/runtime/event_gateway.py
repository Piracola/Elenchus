"""Event stream gateway that enforces envelope schema and sequencing."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any

from app.runtime.event_schema import RuntimeEvent, build_runtime_event

EventSink = Callable[[str, dict[str, Any]], Awaitable[None]]


class EventStreamGateway:
    """Wrap outgoing runtime messages into versioned, sequenced events."""

    def __init__(self, sink: EventSink) -> None:
        self._sink = sink
        self._seq_by_session: dict[str, int] = {}
        self._lock = asyncio.Lock()

    async def create_event(
        self,
        *,
        session_id: str,
        event_type: str,
        payload: dict[str, Any] | None = None,
        source: str = "runtime",
        phase: str | None = None,
    ) -> RuntimeEvent:
        seq = await self._next_sequence(session_id)
        return build_runtime_event(
            session_id=session_id,
            seq=seq,
            event_type=event_type,
            payload=payload,
            source=source,
            phase=phase,
        )

    async def emit(
        self,
        *,
        session_id: str,
        event_type: str,
        payload: dict[str, Any] | None = None,
        source: str = "runtime",
        phase: str | None = None,
    ) -> RuntimeEvent:
        event = await self.create_event(
            session_id=session_id,
            event_type=event_type,
            payload=payload,
            source=source,
            phase=phase,
        )
        await self._sink(session_id, event)
        return event

    async def _next_sequence(self, session_id: str) -> int:
        async with self._lock:
            current = self._seq_by_session.get(session_id, 0) + 1
            self._seq_by_session[session_id] = current
            return current
