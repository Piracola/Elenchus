"""Consensus summary event emission helpers."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

EmitRuntimeEventFunc = Callable[..., Awaitable[None]]


def _discussion_payload(entry: dict[str, Any]) -> dict[str, Any]:
    return {
        "role": entry.get("role", ""),
        "agent_name": entry.get("agent_name", ""),
        "content": entry.get("content", ""),
        "citations": entry.get("citations", []),
        "turn": entry.get("turn"),
        "discussion_kind": entry.get("discussion_kind", "consensus"),
    }


async def emit_discussion_entry(
    emit_runtime_event: EmitRuntimeEventFunc,
    session_id: str,
    entry: dict[str, Any],
) -> None:
    if not isinstance(entry, dict):
        return

    role = entry.get("role")
    if role != "consensus_summary":
        return

    await emit_runtime_event(
        session_id=session_id,
        event_type="consensus_summary",
        payload=_discussion_payload({**entry, "discussion_kind": "consensus"}),
        source="runtime.node.consensus",
        phase="complete",
    )


async def emit_consensus_summary(
    emit_runtime_event: EmitRuntimeEventFunc,
    session_id: str,
    final_state: dict[str, Any],
    prev_history_len: int,
) -> int:
    history = final_state.get("dialogue_history", [])
    curr_history_len = len(history)
    if curr_history_len <= prev_history_len or not history:
        return prev_history_len

    new_entries = history[prev_history_len:curr_history_len]
    for entry in new_entries:
        await emit_discussion_entry(emit_runtime_event, session_id, entry)

    return curr_history_len
