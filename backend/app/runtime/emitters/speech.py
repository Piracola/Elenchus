"""Speech event emission helpers for runtime orchestration."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

EmitRuntimeEventFunc = Callable[..., Awaitable[None]]


async def emit_speech_start(
    emit_runtime_event: EmitRuntimeEventFunc,
    session_id: str,
    *,
    role: str,
    agent_name: str,
    turn: int | None,
    node_name: str = "speaker",
) -> None:
    await emit_runtime_event(
        session_id=session_id,
        event_type="speech_start",
        payload={"role": role, "agent_name": agent_name, "turn": turn},
        source=f"runtime.node.{node_name}",
        phase="speaking",
    )


async def emit_speech_token(
    emit_runtime_event: EmitRuntimeEventFunc,
    session_id: str,
    *,
    role: str,
    agent_name: str,
    token: str,
    turn: int | None,
    node_name: str = "speaker",
) -> None:
    await emit_runtime_event(
        session_id=session_id,
        event_type="speech_token",
        payload={"role": role, "agent_name": agent_name, "token": token, "turn": turn},
        source=f"runtime.node.{node_name}",
        phase="speaking",
    )


async def emit_speech_cancel(
    emit_runtime_event: EmitRuntimeEventFunc,
    session_id: str,
    *,
    role: str,
    agent_name: str,
    turn: int | None,
    node_name: str = "speaker",
) -> None:
    await emit_runtime_event(
        session_id=session_id,
        event_type="speech_cancel",
        payload={"role": role, "agent_name": agent_name, "turn": turn},
        source=f"runtime.node.{node_name}",
        phase="speaking",
    )


async def emit_speech(
    emit_runtime_event: EmitRuntimeEventFunc,
    emit_speech_start_func: Callable[..., Awaitable[None]],
    session_id: str,
    final_state: dict[str, Any],
    prev_history_len: int,
) -> int:
    history = final_state.get("dialogue_history", [])
    curr_history_len = len(history)
    if curr_history_len <= prev_history_len or not history:
        return prev_history_len

    new_entries = history[prev_history_len:curr_history_len]
    already_streamed = bool(final_state.get("speech_was_streamed"))
    speech_node = (
        "sophistry_speaker"
        if str(final_state.get("debate_mode", "") or "") == "sophistry_experiment"
        else "speaker"
    )
    for index, latest in enumerate(new_entries):
        if not isinstance(latest, dict):
            continue
        if index == 0 and not already_streamed:
            await emit_speech_start_func(
                session_id,
                role=latest.get("role", ""),
                agent_name=latest.get("agent_name", ""),
                turn=latest.get("turn"),
                node_name=speech_node,
            )
        await emit_runtime_event(
            session_id=session_id,
            event_type="speech_end",
            payload={
                "role": latest.get("role", ""),
                "agent_name": latest.get("agent_name", ""),
                "content": latest.get("content", ""),
                "citations": latest.get("citations", []),
                "turn": latest.get("turn"),
            },
            source=f"runtime.node.{speech_node}",
            phase="speaking",
        )
    return curr_history_len
