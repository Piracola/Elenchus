from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from app.llm.usage import UsageRecord

ProgressCallback = Callable[[float], Awaitable[None]]
UsageCallback = Callable[[UsageRecord], Awaitable[None]]

MODEL_HEARTBEAT_INTERVAL_SECONDS = 1.0
MODEL_INVOCATION_TIMEOUT_SECONDS = 300.0

_NODE_PHASES = {
    "manage_context": "context",
    "speaker": "speaking",
    "judge": "judging",
    "consensus": "processing",
    "sophistry_speaker": "speaking",
    "sophistry_observer": "processing",
    "sophistry_postmortem": "processing",
}


def build_status_heartbeat_callback(
    state: dict[str, Any],
    *,
    node_name: str,
    template: str,
) -> ProgressCallback | None:
    runtime_event_emitter = state.get("runtime_event_emitter")
    session_id = str(state.get("session_id", "") or "")
    if not runtime_event_emitter or not session_id:
        return None

    phase = _NODE_PHASES.get(node_name, "processing")

    async def emit_progress(elapsed_seconds: float) -> None:
        await runtime_event_emitter.emit_runtime_event(
            session_id=session_id,
            event_type="status",
            payload={
                "content": template.format(seconds=int(elapsed_seconds)),
                "node": node_name,
                "heartbeat": True,
                "elapsed_seconds": int(elapsed_seconds),
            },
            source=f"runtime.node.{node_name}.heartbeat",
            phase=phase,
        )

    return emit_progress


def build_usage_callback(
    state: dict[str, Any],
    *,
    node_name: str,
    role: str | None = None,
) -> UsageCallback | None:
    """Emit one token_usage event per completed model invocation."""
    runtime_event_emitter = state.get("runtime_event_emitter")
    session_id = str(state.get("session_id", "") or "")
    if not runtime_event_emitter or not session_id:
        return None

    phase = _NODE_PHASES.get(node_name, "processing")

    async def emit_token_usage(usage: UsageRecord) -> None:
        turn = state.get("current_turn")
        await runtime_event_emitter.emit_runtime_event(
            session_id=session_id,
            event_type="token_usage",
            payload={
                "node": node_name,
                "role": role,
                "turn": int(turn) if isinstance(turn, (int, float)) else None,
                **usage.as_payload(),
            },
            source=f"runtime.node.{node_name}",
            phase=phase,
        )

    return emit_token_usage
