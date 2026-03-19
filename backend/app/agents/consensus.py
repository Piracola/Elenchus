"""
Final consensus convergence helper.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.agents.prompt_loader import get_judge_prompt
from app.agents.safe_invoke import invoke_text_model, normalize_model_text

logger = logging.getLogger(__name__)

_CONSENSUS_RULES = """
## Consensus Convergence Rules
- Reply in Chinese.
- You are producing a final convergence memo after the debate ends.
- Look for shared ground first, then clearly separate unresolved disagreements.
- Do not erase real differences for the sake of harmony.
- Use concise markdown headings and bullets.
""".strip()


def _build_consensus_instruction(state: dict[str, Any]) -> str:
    topic = str(state.get("topic", "") or "")
    dialogue_history = state.get("dialogue_history", [])
    cumulative_scores = state.get("cumulative_scores", {})
    current_scores = state.get("current_scores", {})
    team_history = state.get("team_dialogue_history", [])
    jury_history = state.get("jury_dialogue_history", [])

    parts = [
        f"辩题：{topic}",
        "请在辩论结束后输出一份“共识收敛”总结，供用户快速看到哪些地方已经收敛、哪些地方仍然对立。",
        "输出结构：",
        "1. 已形成的最强共识",
        "2. 仍未解决的核心分歧",
        "3. 若要继续辩论，最值得继续验证的问题",
        "4. 哪一方在什么条件下更占优",
    ]

    if dialogue_history:
        parts.append("## Public Debate Highlights")
        for entry in dialogue_history[-8:]:
            if not isinstance(entry, dict):
                continue
            role = entry.get("role", "")
            content = str(entry.get("content", "") or "")
            parts.append(f"### [{role}]\n{content}")

    if team_history:
        parts.append("## Team Discussion Highlights")
        for entry in team_history[-4:]:
            if not isinstance(entry, dict):
                continue
            parts.append(f"- {entry.get('agent_name', 'team')}: {entry.get('content', '')}")

    if jury_history:
        parts.append("## Jury Discussion Highlights")
        for entry in jury_history[-4:]:
            if not isinstance(entry, dict):
                continue
            parts.append(f"- {entry.get('agent_name', 'jury')}: {entry.get('content', '')}")

    if current_scores:
        parts.append(f"## Final Round Scores\n{current_scores}")
    if cumulative_scores:
        parts.append(f"## Cumulative Scores\n{cumulative_scores}")

    return "\n\n".join(parts)


async def converge_consensus(state: dict[str, Any]) -> dict[str, Any]:
    """Generate a final convergence summary after the debate completes."""
    reasoning_config = state.get("reasoning_config", {})
    if not bool(reasoning_config.get("consensus_enabled", True)):
        return {}

    agent_configs = state.get("agent_configs", {})
    override = agent_configs.get("consensus", agent_configs.get("judge"))
    custom_prompt = ""
    if isinstance(override, dict):
        custom_prompt = str(override.get("custom_prompt", "") or "")

    system_prompt = get_judge_prompt()
    system_prompt += f"\n\n{_CONSENSUS_RULES}"
    if custom_prompt:
        system_prompt += f"\n\n## Custom Persona Instructions\n{custom_prompt}"

    instruction = _build_consensus_instruction(state)

    try:
        content = await invoke_text_model(
            [
                SystemMessage(content=system_prompt),
                HumanMessage(content=instruction),
            ],
            override=override if isinstance(override, dict) else None,
        )
        content = normalize_model_text(content)
    except Exception as exc:
        logger.warning("Consensus convergence failed: %s", exc)
        content = "共识收敛总结生成失败，请结合最终评分与双方发言自行回看关键分歧。"

    entry = {
        "role": "consensus_summary",
        "agent_name": "共识收敛员",
        "content": content,
        "citations": [],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "turn": int(state.get("current_turn", 0) or 0),
        "discussion_kind": "consensus",
    }
    return {
        "jury_dialogue_history": [entry],
    }
