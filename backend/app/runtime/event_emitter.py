"""Runtime event emission helpers for debate orchestration."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING, Any

from .emitters.discussion import emit_jury_discussion as _emit_jury_discussion
from .emitters.discussion import emit_team_discussion as _emit_team_discussion
from .emitters.report import emit_fact_check as _emit_fact_check
from .emitters.report import emit_judge_scores as _emit_judge_scores
from .emitters.report import emit_memory_updates as _emit_memory_updates
from .emitters.report import emit_sophistry_reports as _emit_sophistry_reports
from .emitters.report import emit_turn_complete as _emit_turn_complete
from .emitters.speech import emit_speech as _emit_speech
from .emitters.speech import emit_speech_cancel as _emit_speech_cancel
from .emitters.speech import emit_speech_start as _emit_speech_start
from .emitters.speech import emit_speech_token as _emit_speech_token
from .runtime_status import NODE_STATUS as _NODE_STATUS
from .runtime_status import describe_status as _describe_status
from .runtime_status import predict_next_status_node as _predict_next_status_node

if TYPE_CHECKING:
    from app.runtime.bus import RuntimeBus

EventEmitter = Callable[[str, dict[str, Any]], Awaitable[None]]


async def noop_emit_event(session_id: str, message: dict[str, Any]) -> None:
    """Fallback emitter for scripts/tests that do not attach a transport."""
    return None


class RuntimeEventEmitter:
    """Encapsulate runtime event emission and status prediction rules."""

    def __init__(
        self,
        *,
        runtime_bus: "RuntimeBus" | None = None,
        emit_event: EventEmitter = noop_emit_event,
    ) -> None:
        self._runtime_bus = runtime_bus
        self._emit_event = emit_event

    async def emit_runtime_event(
        self,
        *,
        session_id: str,
        event_type: str,
        payload: dict[str, Any] | None = None,
        source: str = "runtime.orchestrator",
        phase: str | None = None,
    ) -> None:
        if self._runtime_bus is not None:
            await self._runtime_bus.emit(
                session_id=session_id,
                event_type=event_type,
                payload=payload,
                source=source,
                phase=phase,
            )
            return

        fallback_message = {"type": event_type, **(payload or {})}
        if phase:
            fallback_message["phase"] = phase
        await self._emit_event(session_id, fallback_message)

    async def emit_status(self, session_id: str, node_name: str) -> None:
        status_msg, phase = self.describe_status(node_name)
        await self.emit_runtime_event(
            session_id=session_id,
            event_type="status",
            payload={"content": status_msg, "node": node_name},
            phase=phase,
            source=f"runtime.node.{node_name}",
        )

    def describe_status(self, node_name: str) -> tuple[str, str]:
        return _describe_status(node_name)

    async def emit_status_if_changed(
        self,
        session_id: str,
        node_name: str,
        last_status_node: str,
    ) -> str:
        if not node_name or node_name == last_status_node:
            return last_status_node

        await self.emit_status(session_id, node_name)
        return node_name

    async def emit_speech_start(
        self,
        session_id: str,
        *,
        role: str,
        agent_name: str,
        turn: int | None,
        node_name: str = "speaker",
    ) -> None:
        await _emit_speech_start(
            self.emit_runtime_event,
            session_id,
            role=role,
            agent_name=agent_name,
            turn=turn,
            node_name=node_name,
        )

    async def emit_speech_token(
        self,
        session_id: str,
        *,
        role: str,
        agent_name: str,
        token: str,
        turn: int | None,
        node_name: str = "speaker",
    ) -> None:
        await _emit_speech_token(
            self.emit_runtime_event,
            session_id,
            role=role,
            agent_name=agent_name,
            token=token,
            turn=turn,
            node_name=node_name,
        )

    async def emit_speech_cancel(
        self,
        session_id: str,
        *,
        role: str,
        agent_name: str,
        turn: int | None,
        node_name: str = "speaker",
    ) -> None:
        await _emit_speech_cancel(
            self.emit_runtime_event,
            session_id,
            role=role,
            agent_name=agent_name,
            turn=turn,
            node_name=node_name,
        )

    def predict_next_status_node(
        self,
        node_name: str,
        final_state: dict[str, Any],
    ) -> str | None:
        return _predict_next_status_node(node_name, final_state)

    async def emit_speech(
        self,
        session_id: str,
        final_state: dict[str, Any],
        prev_history_len: int,
    ) -> int:
        return await _emit_speech(
            self.emit_runtime_event,
            self._emit_speech_start_wrapper,
            session_id,
            final_state,
            prev_history_len,
        )

    async def _emit_speech_start_wrapper(
        self,
        session_id: str,
        *,
        role: str,
        agent_name: str,
        turn: int | None,
        node_name: str = "speaker",
    ) -> None:
        await _emit_speech_start(
            self.emit_runtime_event,
            session_id,
            role=role,
            agent_name=agent_name,
            turn=turn,
            node_name=node_name,
        )

    async def emit_sophistry_reports(
        self,
        session_id: str,
        final_state: dict[str, Any],
        prev_history_len: int,
    ) -> int:
        return await _emit_sophistry_reports(
            self.emit_runtime_event,
            session_id,
            final_state,
            prev_history_len,
        )

    async def emit_team_discussion(
        self,
        session_id: str,
        final_state: dict[str, Any],
        prev_history_len: int,
    ) -> int:
        return await _emit_team_discussion(
            self.emit_runtime_event,
            session_id,
            final_state,
            prev_history_len,
        )

    async def emit_jury_discussion(
        self,
        session_id: str,
        final_state: dict[str, Any],
        prev_history_len: int,
    ) -> int:
        return await _emit_jury_discussion(
            self.emit_runtime_event,
            session_id,
            final_state,
            prev_history_len,
        )

    async def emit_fact_check(self, session_id: str, final_state: dict[str, Any]) -> None:
        await _emit_fact_check(self.emit_runtime_event, session_id, final_state)

    async def emit_judge_scores(
        self,
        session_id: str,
        final_state: dict[str, Any],
        emitted_judge_keys: set[tuple[int, str]],
    ) -> None:
        await _emit_judge_scores(
            self.emit_runtime_event,
            session_id,
            final_state,
            emitted_judge_keys,
        )

    async def emit_turn_complete(self, session_id: str, final_state: dict[str, Any]) -> None:
        await _emit_turn_complete(self.emit_runtime_event, session_id, final_state)

    async def emit_memory_updates(
        self,
        session_id: str,
        final_state: dict[str, Any],
        previous_count: int,
    ) -> int:
        return await _emit_memory_updates(
            self.emit_runtime_event,
            session_id,
            final_state,
            previous_count,
        )
