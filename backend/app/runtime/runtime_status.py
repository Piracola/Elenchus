"""Status description and prediction logic for runtime event emission."""

from __future__ import annotations

from typing import Any


NODE_STATUS = {
    "manage_context": ("正在整理上下文...", "preparing"),
    "set_speaker": ("正在切换发言者...", "preparing"),
    "team_discussion": ("组内讨论正在展开...", "preparing"),
    "jury_discussion": ("陪审团讨论正在展开...", "preparing"),
    "speaker": ("辩手正在组织发言...", "speaking"),
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


def predict_next_status_node(
    node_name: str,
    final_state: dict[str, Any],
) -> str | None:
    debate_mode = str(final_state.get("debate_mode", "") or "")

    if node_name == "set_speaker":
        current_speaker = final_state.get("current_speaker")
        if isinstance(current_speaker, str) and current_speaker:
            if debate_mode == "sophistry_experiment":
                return "sophistry_speaker"
            team_config = final_state.get("team_config", {})
            agents_per_team = int(team_config.get("agents_per_team", 0) or 0)
            discussion_rounds = int(team_config.get("discussion_rounds", 0) or 0)
            if agents_per_team > 0 and discussion_rounds > 0:
                return "team_discussion"
            return "speaker"
        if debate_mode == "sophistry_experiment":
            return "sophistry_observer"
        return None

    if node_name == "team_discussion":
        return "speaker"

    if node_name == "jury_discussion":
        return "judge"

    if node_name == "speaker":
        if has_pending_tool_calls(final_state):
            return "tool_executor"

        participants = final_state.get("participants", ["proposer", "opposer"])
        current_idx = final_state.get("current_speaker_index", 0)
        if isinstance(participants, list) and current_idx + 1 >= len(participants):
            jury_config = final_state.get("jury_config", {})
            agents_per_jury = int(jury_config.get("agents_per_jury", 0) or 0)
            discussion_rounds = int(jury_config.get("discussion_rounds", 0) or 0)
            if agents_per_jury > 0 and discussion_rounds > 0:
                return "jury_discussion"
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
