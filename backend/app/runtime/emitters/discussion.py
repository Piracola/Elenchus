"""Discussion event emission helpers for runtime orchestration."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

EmitRuntimeEventFunc = Callable[..., Awaitable[None]]


async def emit_team_discussion(
    emit_runtime_event: EmitRuntimeEventFunc,
    session_id: str,
    final_state: dict[str, Any],
    prev_history_len: int,
) -> int:
    history = final_state.get("team_dialogue_history", [])
    curr_history_len = len(history)
    if curr_history_len <= prev_history_len or not history:
        return prev_history_len

    new_entries = history[prev_history_len:curr_history_len]
    for entry in new_entries:
        if not isinstance(entry, dict):
            continue

        event_type = "team_summary" if entry.get("role") == "team_summary" else "team_discussion"
        await emit_runtime_event(
            session_id=session_id,
            event_type=event_type,
            payload={
                "role": entry.get("role", ""),
                "agent_name": entry.get("agent_name", ""),
                "content": entry.get("content", ""),
                "citations": entry.get("citations", []),
                "turn": entry.get("turn"),
                "discussion_kind": entry.get("discussion_kind", "team"),
                "team_side": entry.get("team_side", ""),
                "team_round": entry.get("team_round"),
                "team_member_index": entry.get("team_member_index"),
                "team_specialty": entry.get("team_specialty", ""),
                "source_role": entry.get("source_role", ""),
            },
            source="runtime.node.team_discussion",
            phase="preparing",
        )

    return curr_history_len


async def emit_jury_discussion(
    emit_runtime_event: EmitRuntimeEventFunc,
    session_id: str,
    final_state: dict[str, Any],
    prev_history_len: int,
) -> int:
    history = final_state.get("jury_dialogue_history", [])
    curr_history_len = len(history)
    if curr_history_len <= prev_history_len or not history:
        return prev_history_len

    new_entries = history[prev_history_len:curr_history_len]
    for entry in new_entries:
        if not isinstance(entry, dict):
            continue

        role = entry.get("role")
        if role == "jury_summary":
            event_type = "jury_summary"
        elif role == "consensus_summary":
            event_type = "consensus_summary"
        else:
            event_type = "jury_discussion"
        source = "runtime.node.consensus" if role == "consensus_summary" else "runtime.node.jury_discussion"
        phase = "complete" if role == "consensus_summary" else "preparing"

        await emit_runtime_event(
            session_id=session_id,
            event_type=event_type,
            payload={
                "role": role or "",
                "agent_name": entry.get("agent_name", ""),
                "content": entry.get("content", ""),
                "citations": entry.get("citations", []),
                "turn": entry.get("turn"),
                "discussion_kind": entry.get("discussion_kind", "jury"),
                "jury_round": entry.get("jury_round"),
                "jury_member_index": entry.get("jury_member_index"),
                "jury_perspective": entry.get("jury_perspective", ""),
            },
            source=source,
            phase=phase,
        )

    return curr_history_len
