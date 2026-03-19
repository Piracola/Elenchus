"""Canonical debate runner name for the simplified runtime architecture."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING, Any

from app.runtime.event_emitter import noop_emit_event
from app.runtime.orchestrator import DebateOrchestrator
from app.runtime.session_repository import SessionRuntimeRepository

if TYPE_CHECKING:
    from app.runtime.bus import RuntimeBus
    from app.runtime.engines import DebateEngine

EventEmitter = Callable[[str, dict[str, Any]], Awaitable[None]]


class DebateRunner(DebateOrchestrator):
    """Thin alias around the orchestrator with the new runtime naming."""

    def __init__(
        self,
        *,
        repository: SessionRuntimeRepository | None = None,
        engine: "DebateEngine" | None = None,
        runtime_bus: "RuntimeBus" | None = None,
        emit_event: EventEmitter | None = None,
    ) -> None:
        super().__init__(
            repository=repository,
            engine=engine,
            runtime_bus=runtime_bus,
            emit_event=emit_event or noop_emit_event,
        )
