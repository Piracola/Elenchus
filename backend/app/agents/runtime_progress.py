from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

ProgressCallback = Callable[[float], Awaitable[None]]

MODEL_HEARTBEAT_INTERVAL_SECONDS = 8.0
MODEL_INVOCATION_TIMEOUT_SECONDS = 300.0

_NODE_PHASES = {
    "manage_context": "context",
    "speaker": "speaking",
    "judge": "judging",
    "team_discussion": "preparing",
    "jury_discussion": "preparing",
    "consensus": "complete",
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
