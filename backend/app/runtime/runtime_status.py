"""Status description and prediction logic for runtime event emission."""

from __future__ import annotations

from typing import Any


NODE_STATUS = {
    "manage_context": ("正在整理上下文...", "preparing"),
    "set_speaker": ("正在切换发言者...", "preparing"),
    "speaker": ("辩手正在组织发言...", "speaking"),
    "group_discussion": ("组内讨论正在生成本轮赛前简报...", "processing"),
    "sophistry_speaker": ("诡辩实验发言正在生成...", "speaking"),
    "tool_executor": ("正在调用工具核验事实...", "fact_checking"),
    "judge": ("裁判正在评估本轮表现...", "judging"),
    "sophistry_observer": ("诡辩观察员正在整理本轮报告...", "processing"),
    "advance_turn": ("准备进入下一回合...", "context"),
    "consensus": ("正在生成最终共识总结...", "complete"),
    "sophistry_postmortem": ("诡辩实验总览正在生成...", "complete"),
}


def describe_status(node_name: str) -> tuple[str, str]:
    return NODE_STATUS.get(node_name, (f"处理中: {node_name}", "processing"))


def has_pending_tool_calls(state: dict[str, Any]) -> bool:
    messages = state.get("messages", [])
    if not isinstance(messages, list) or not messages:
        return False

    last_message = messages[-1]
    tool_calls = getattr(last_message, "tool_calls", None)
    return bool(tool_calls)


def _configured_group_discussion_rounds(state: dict[str, Any]) -> int:
    reasoning_config = state.get("reasoning_config", {})
    if not isinstance(reasoning_config, dict):
        return 0
    try:
        return int(reasoning_config.get("group_discussion_rounds", 0) or 0)
    except (TypeError, ValueError):
        return 0


def _coerce_turn(value: Any, fallback: int) -> int:
    if isinstance(value, int) and not isinstance(value, bool):
        return value
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _current_turn_group_discussion_count(state: dict[str, Any]) -> int:
    current_turn = _coerce_turn(state.get("current_turn", 0), 0)
    dialogue_history = state.get("dialogue_history", [])
    if not isinstance(dialogue_history, list):
        return 0
    return sum(
        1
        for entry in dialogue_history
        if isinstance(entry, dict)
        and entry.get("role") == "group_discussion"
        and _coerce_turn(entry.get("turn", -1), -1) == current_turn
    )


def should_run_pre_round_group_discussion(state: dict[str, Any]) -> bool:
    rounds = _configured_group_discussion_rounds(state)
    return rounds > 0 and _current_turn_group_discussion_count(state) < rounds


def _turn_limit_reached(state: dict[str, Any]) -> bool:
    current_turn = _coerce_turn(state.get("current_turn", 0), 0)
    max_turns = _coerce_turn(state.get("max_turns", 5), 5)
    return max_turns > 0 and current_turn >= max_turns


def _has_consensus_summary(state: dict[str, Any]) -> bool:
    dialogue_history = state.get("dialogue_history", [])
    if not isinstance(dialogue_history, list):
        return False
    return any(
        isinstance(entry, dict)
        and (
            entry.get("role") == "consensus_summary"
            or entry.get("discussion_kind") == "consensus"
        )
        for entry in dialogue_history
    )


def predict_next_status_node(
    node_name: str,
    final_state: dict[str, Any],
) -> str | None:
    debate_mode = str(final_state.get("debate_mode", "") or "")

    if node_name == "manage_context":
        if _turn_limit_reached(final_state):
            reasoning_config = final_state.get("reasoning_config", {})
            if (
                isinstance(reasoning_config, dict)
                and bool(reasoning_config.get("consensus_enabled", True))
                and not _has_consensus_summary(final_state)
            ):
                return "consensus"
            return None
        if debate_mode == "sophistry_experiment":
            return "set_speaker"
        if should_run_pre_round_group_discussion(final_state):
            return "group_discussion"
        return "set_speaker"

    if node_name == "set_speaker":
        current_speaker = final_state.get("current_speaker")
        if isinstance(current_speaker, str) and current_speaker:
            if debate_mode == "sophistry_experiment":
                return "sophistry_speaker"
            return "speaker"
        if debate_mode == "sophistry_experiment":
            return "sophistry_observer"
        return None

    if node_name == "speaker":
        if has_pending_tool_calls(final_state):
            return "tool_executor"

        participants = final_state.get("participants", ["proposer", "opposer"])
        current_idx = final_state.get("current_speaker_index", 0)
        if isinstance(participants, list) and current_idx + 1 >= len(participants):
            return "judge"
        return None

    if node_name == "sophistry_speaker":
        participants = final_state.get("participants", ["proposer", "opposer"])
        current_idx = final_state.get("current_speaker_index", 0)
        if isinstance(participants, list) and current_idx + 1 >= len(participants):
            return "sophistry_observer"
        return "set_speaker"

    if node_name == "sophistry_observer":
        return "advance_turn"

    if node_name == "tool_executor":
        return "speaker"

    if node_name == "group_discussion":
        return "set_speaker"

    if node_name == "advance_turn":
        current_turn = final_state.get("current_turn", 0)
        max_turns = final_state.get("max_turns", 5)
        reasoning_config = final_state.get("reasoning_config", {})
        if debate_mode == "sophistry_experiment":
            if isinstance(current_turn, int) and isinstance(max_turns, int) and current_turn < max_turns:
                return "manage_context"
            return "sophistry_postmortem"
        if isinstance(current_turn, int) and isinstance(max_turns, int) and current_turn < max_turns:
            return "manage_context"
        if bool(reasoning_config.get("consensus_enabled", True)):
            return "consensus"
        return None

    return None
