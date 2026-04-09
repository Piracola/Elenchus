"""Report and scoring event emission helpers for runtime orchestration."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

EmitRuntimeEventFunc = Callable[..., Awaitable[None]]


async def emit_sophistry_reports(
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
        if not isinstance(entry, dict):
            continue

        role = str(entry.get("role", "") or "")
        if role not in {"sophistry_round_report", "sophistry_final_report"}:
            continue

        report_payload = (
            final_state.get("final_mode_report")
            if role == "sophistry_final_report"
            else final_state.get("current_mode_report")
        )
        await emit_runtime_event(
            session_id=session_id,
            event_type=role,
            payload={
                "role": role,
                "agent_name": entry.get("agent_name", ""),
                "content": entry.get("content", ""),
                "citations": entry.get("citations", []),
                "turn": entry.get("turn"),
                "source_turn": entry.get("turn"),
                "source_roles": [
                    speaker_entry.get("role", "")
                    for speaker_entry in history
                    if isinstance(speaker_entry, dict)
                    and speaker_entry.get("role") in {"proposer", "opposer"}
                    and speaker_entry.get("turn") == entry.get("turn")
                ],
                "report": report_payload if isinstance(report_payload, dict) else {},
            },
            source=(
                "runtime.node.sophistry_postmortem"
                if role == "sophistry_final_report"
                else "runtime.node.sophistry_observer"
            ),
            phase="complete" if role == "sophistry_final_report" else "processing",
        )

    return curr_history_len


async def emit_fact_check(
    emit_runtime_event: EmitRuntimeEventFunc,
    session_id: str,
    final_state: dict[str, Any],
) -> None:
    knowledge = final_state.get("shared_knowledge", [])
    recent_facts = [item for item in knowledge if item.get("type") == "fact"]
    if recent_facts:
        await emit_runtime_event(
            session_id=session_id,
            event_type="fact_check_result",
            payload={"results": [recent_facts[-1]], "count": len(knowledge)},
            source="runtime.node.tool_executor",
            phase="fact_checking",
        )


async def emit_judge_scores(
    emit_runtime_event: EmitRuntimeEventFunc,
    session_id: str,
    final_state: dict[str, Any],
    emitted_judge_keys: set[tuple[int, str]],
) -> None:
    scores = final_state.get("current_scores", {})
    turn = int(final_state.get("current_turn", 0))
    for role, score_data in scores.items():
        dedupe_key = (turn, role)
        if dedupe_key in emitted_judge_keys:
            continue

        await emit_runtime_event(
            session_id=session_id,
            event_type="judge_score",
            payload={"role": role, "scores": score_data, "turn": turn},
            source="runtime.node.judge",
            phase="judging",
        )
        emitted_judge_keys.add(dedupe_key)


async def emit_turn_complete(
    emit_runtime_event: EmitRuntimeEventFunc,
    session_id: str,
    final_state: dict[str, Any],
) -> None:
    await emit_runtime_event(
        session_id=session_id,
        event_type="turn_complete",
        payload={
            "turn": final_state.get("current_turn", 0),
            "current_scores": final_state.get("current_scores", {}),
            "cumulative_scores": final_state.get("cumulative_scores", {}),
        },
        source="runtime.node.advance_turn",
        phase="context",
    )


async def emit_memory_updates(
    emit_runtime_event: EmitRuntimeEventFunc,
    session_id: str,
    final_state: dict[str, Any],
    previous_count: int,
) -> int:
    knowledge = final_state.get("shared_knowledge", [])
    if not isinstance(knowledge, list):
        return previous_count

    total_count = len(knowledge)
    if total_count <= 0:
        return 0
    if total_count <= previous_count:
        return total_count

    new_items = knowledge[previous_count:total_count]
    for index, item in enumerate(new_items, start=previous_count):
        if not isinstance(item, dict):
            continue

        memory_type = str(item.get("type", "memo"))
        source = "runtime.memory"
        phase = "context"
        if memory_type == "fact":
            source = "runtime.node.tool_executor"
            phase = "fact_checking"
        elif memory_type in {"memo", "context"}:
            source = "runtime.node.manage_context"

        await emit_runtime_event(
            session_id=session_id,
            event_type="memory_write",
            payload={
                "memory_type": memory_type,
                "memory": item,
                "memory_index": index,
                "total_memories": total_count,
                "source_kind": item.get("source_kind"),
                "source_timestamp": item.get("source_timestamp"),
                "source_role": item.get("source_role") or item.get("role"),
                "source_agent_name": item.get("source_agent_name") or item.get("agent_name"),
                "source_excerpt": item.get("source_excerpt"),
                "source_turn": item.get("source_turn"),
            },
            source=source,
            phase=phase,
        )

    return total_count
