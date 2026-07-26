"""
Final consensus convergence helper.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.agents.context_engine import build_context_packet
from app.agents.live_agent_config import refresh_agent_configs_for_session
from app.agents.prompt_loader import get_consensus_prompt
from app.agents.runtime_progress import (
    MODEL_HEARTBEAT_INTERVAL_SECONDS,
    MODEL_INVOCATION_TIMEOUT_SECONDS,
    build_status_heartbeat_callback,
    build_usage_callback,
)
from app.llm.invoke import invoke_text_model, normalize_model_text

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
    cumulative_scores = state.get("cumulative_scores", {})
    current_scores = state.get("current_scores", {})
    packet = build_context_packet(
        state,
        agent_role="consensus",
        task_lines=[
            f"辩题：{topic}",
            "请基于整场辩论绘制最终概念地图。",
        ],
        live_constraints=[
            "不要把组内讨论当作正式立场，只把它当作规划线索。",
        ],
    )

    parts = [
        f"辩题：{topic}",
        "请在辩论结束后输出一份“共识收敛”总结，供用户快速看到哪些地方已经收敛、哪些地方仍然对立。",
        "输出结构：",
        "1. 已形成的最强共识",
        "2. 仍未解决的核心分歧",
        "3. 若要继续辩论，最值得继续验证的问题",
        "4. 哪一方在什么条件下更占优",
        packet.render(),
    ]

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

    agent_configs = await refresh_agent_configs_for_session(state)
    override = agent_configs.get("consensus", agent_configs.get("judge"))
    custom_prompt = ""
    if isinstance(override, dict):
        custom_prompt = str(override.get("custom_prompt", "") or "")

    system_prompt = get_consensus_prompt()
    system_prompt += f"\n\n{_CONSENSUS_RULES}"
    if custom_prompt:
        system_prompt += f"\n\n## Custom Persona Instructions\n{custom_prompt}"

    instruction = _build_consensus_instruction(state)
    progress_callback = build_status_heartbeat_callback(
        state,
        node_name="consensus",
        template="正在生成最终共识总结，已等待 {seconds} 秒...",
    )
    session_id = str(state.get("session_id", "") or "")
    runtime_event_emitter = state.get("runtime_event_emitter")
    if session_id and runtime_event_emitter is not None:
        await runtime_event_emitter.emit_runtime_event(
            session_id=session_id,
            event_type="status",
            payload={
                "content": "共识收敛员正在整理全局结论...",
                "node": "consensus",
            },
            source="runtime.node.consensus",
            phase="complete",
        )

    try:
        content = await invoke_text_model(
            [
                SystemMessage(content=system_prompt),
                HumanMessage(content=instruction),
            ],
            override=override if isinstance(override, dict) else None,
            on_progress=progress_callback,
            on_usage=build_usage_callback(state, node_name="consensus"),
            timeout_seconds=MODEL_INVOCATION_TIMEOUT_SECONDS,
            heartbeat_interval_seconds=MODEL_HEARTBEAT_INTERVAL_SECONDS,
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
        "timestamp": datetime.now(UTC).isoformat(),
        "turn": int(state.get("current_turn", 0) or 0),
        "discussion_kind": "consensus",
    }
    if session_id and runtime_event_emitter is not None:
        await runtime_event_emitter.emit_discussion_entry(session_id, entry)
    return {
        "dialogue_history": [entry],
        "agent_configs": agent_configs,
    }
