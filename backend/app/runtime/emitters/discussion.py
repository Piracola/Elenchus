"""Discussion event emission helpers for runtime orchestration."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

EmitRuntimeEventFunc = Callable[..., Awaitable[None]]


def _discussion_source_and_phase(entry: dict[str, Any]) -> tuple[str, str]:
    role = entry.get("role")
    if role == "consensus_summary":
        return "runtime.node.consensus", "complete"
    if entry.get("discussion_kind") == "jury" or str(role or "").startswith("jury_"):
        return "runtime.node.jury_discussion", "preparing"
    return "runtime.node.team_discussion", "preparing"


def _discussion_payload(entry: dict[str, Any]) -> dict[str, Any]:
    return {
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
        "jury_round": entry.get("jury_round"),
        "jury_member_index": entry.get("jury_member_index"),
        "jury_perspective": entry.get("jury_perspective", ""),
    }


async def emit_discussion_stream_start(
    emit_runtime_event: EmitRuntimeEventFunc,
    session_id: str,
    entry: dict[str, Any],
) -> None:
    source, phase = _discussion_source_and_phase(entry)
    await emit_runtime_event(
        session_id=session_id,
        event_type="discussion_stream_start",
        payload=_discussion_payload(entry),
        source=source,
        phase=phase,
    )


async def emit_discussion_stream_token(
    emit_runtime_event: EmitRuntimeEventFunc,
    session_id: str,
    entry: dict[str, Any],
    token: str,
) -> None:
    if not token:
        return
    source, phase = _discussion_source_and_phase(entry)
    payload = _discussion_payload(entry)
    payload["token"] = token
    payload.pop("content", None)
    await emit_runtime_event(
        session_id=session_id,
        event_type="discussion_stream_token",
        payload=payload,
        source=source,
        phase=phase,
    )


async def emit_discussion_stream_cancel(
    emit_runtime_event: EmitRuntimeEventFunc,
    session_id: str,
    entry: dict[str, Any],
) -> None:
    source, phase = _discussion_source_and_phase(entry)
    await emit_runtime_event(
        session_id=session_id,
        event_type="discussion_stream_cancel",
        payload=_discussion_payload(entry),
        source=source,
        phase=phase,
    )


async def emit_discussion_entry(
    emit_runtime_event: EmitRuntimeEventFunc,
    session_id: str,
    entry: dict[str, Any],
) -> None:
    if not isinstance(entry, dict):
        return

    role = entry.get("role")
    discussion_kind = entry.get("discussion_kind", "team")

    if role == "team_summary":
        event_type = "team_summary"
        source = "runtime.node.team_discussion"
        phase = "preparing"
    elif role == "team_member":
        event_type = "team_discussion"
        source = "runtime.node.team_discussion"
        phase = "preparing"
    elif role == "jury_summary":
        event_type = "jury_summary"
        source = "runtime.node.jury_discussion"
        phase = "preparing"
    elif role == "consensus_summary":
        event_type = "consensus_summary"
        source = "runtime.node.consensus"
        phase = "complete"
    else:
        event_type = "jury_discussion"
        source = "runtime.node.jury_discussion"
        phase = "preparing"

    await emit_runtime_event(
        session_id=session_id,
        event_type=event_type,
        payload=_discussion_payload({**entry, "discussion_kind": discussion_kind}),
        source=source,
        phase=phase,
    )


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
        await emit_discussion_entry(emit_runtime_event, session_id, entry)

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
        await emit_discussion_entry(emit_runtime_event, session_id, entry)

    return curr_history_len
