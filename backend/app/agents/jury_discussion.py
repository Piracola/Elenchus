"""
Multi-perspective jury discussion helpers.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.agents.context_builder import build_context_for_agent
from app.agents.prompt_loader import get_judge_prompt
from app.agents.runtime_progress import (
    MODEL_HEARTBEAT_INTERVAL_SECONDS,
    MODEL_INVOCATION_TIMEOUT_SECONDS,
    build_status_heartbeat_callback,
)
from app.llm.invoke import invoke_text_model, normalize_model_text

logger = logging.getLogger(__name__)

_JURY_PERSPECTIVES = [
    "逻辑审查",
    "证据可信度",
    "隐藏前提挖掘",
    "反驳命中度",
    "政策可执行性",
    "价值冲突分析",
    "公众说服力",
    "风险与边界条件",
    "追问链设计",
    "立场比较与权衡",
]

_JURY_RULES = """
## Internal Jury Rules
- Reply in Chinese.
- You are part of an internal multi-perspective jury, not a public debater.
- Evaluate the current round fairly from your assigned perspective.
- Use concise markdown with short bullets.
- Surface the strongest version of each side before criticizing it.
- Identify hidden assumptions and suggest high-value follow-up questions when useful.
""".strip()


def _jury_member_name(index: int) -> str:
    return f"陪审员{index + 1}"


def _jury_summary_name() -> str:
    return "陪审团总结员"


def _perspective_for(index: int) -> str:
    return _JURY_PERSPECTIVES[index % len(_JURY_PERSPECTIVES)]


def _build_discussion_history_block(entries: list[dict[str, Any]]) -> str:
    if not entries:
        return ""

    lines = ["## Current Jury Discussion"]
    for entry in entries:
        agent_name = str(entry.get("agent_name", entry.get("role", "陪审员")) or "陪审员")
        perspective = str(entry.get("jury_perspective", "") or "")
        prefix = agent_name
        if perspective:
            prefix += f"（{perspective}）"
        lines.append(f"- {prefix}: {entry.get('content', '')}")
    return "\n".join(lines)


def _build_member_instruction(
    *,
    topic: str,
    current_turn: int,
    max_turns: int,
    agent_name: str,
    perspective: str,
    context_block: str,
    discussion_history: list[dict[str, Any]],
    reasoning_config: dict[str, Any],
) -> str:
    discussion_block = _build_discussion_history_block(discussion_history)
    steelman_enabled = bool(reasoning_config.get("steelman_enabled", True))
    parts = [
        f"你是内部多视角陪审团成员，名字是「{agent_name}」。",
        f"你的评估视角是：{perspective}。",
        f"当前是第 {current_turn + 1} / {max_turns} 轮，辩题是：{topic}。",
        "请只评估当前这轮双方公开发言的质量，不要替任何一方站队。",
        "请输出：1. 本视角下正方最强点 2. 本视角下反方最强点 3. 最大漏洞 4. 建议继续追问的问题。",
        context_block,
    ]
    if steelman_enabled:
        parts.append("先用最强解释分别还原正反双方当前轮最值得认真对待的论点，再进行批评。")
    if discussion_block:
        parts.append(discussion_block)
    return "\n\n".join(part for part in parts if part)


def _build_summary_instruction(
    *,
    topic: str,
    current_turn: int,
    max_turns: int,
    context_block: str,
    discussion_history: list[dict[str, Any]],
) -> str:
    discussion_block = _build_discussion_history_block(discussion_history)
    return "\n\n".join(
        part
        for part in [
            "你是内部多视角陪审团总结员。",
            f"当前是第 {current_turn + 1} / {max_turns} 轮。",
            f"辩题：{topic}。",
            "请基于陪审团讨论输出一份给正式裁判使用的内部摘要。",
            "格式要求：",
            "1. 正方本轮最强论点",
            "2. 反方本轮最强论点",
            "3. 本轮仍未解决的核心冲突",
            "4. 隐藏前提与建议追问",
            "5. 裁判评分时最该关注的权衡点",
            context_block,
            discussion_block,
        ]
        if part
    )


def _build_system_prompt(custom_prompt: str) -> str:
    system_prompt = get_judge_prompt()
    system_prompt += f"\n\n{_JURY_RULES}"
    if custom_prompt:
        system_prompt += f"\n\n## Custom Persona Instructions\n{custom_prompt}"
    return system_prompt


async def jury_discuss(state: dict[str, Any]) -> dict[str, Any]:
    """Run the optional multi-perspective jury discussion before scoring."""
    jury_config = state.get("jury_config", {})
    jurors = int(jury_config.get("agents_per_jury", 0) or 0)
    discussion_rounds = int(jury_config.get("discussion_rounds", 0) or 0)
    if jurors <= 0 or discussion_rounds <= 0:
        return {
            "current_jury_discussion": [],
            "current_jury_summary": None,
        }

    topic = str(state.get("topic", "") or "")
    current_turn = int(state.get("current_turn", 0) or 0)
    max_turns = int(state.get("max_turns", 0) or 0)
    shared_knowledge = state.get("shared_knowledge", [])
    dialogue_history = state.get("dialogue_history", [])
    recent_dialogue_history = state.get("recent_dialogue_history", dialogue_history)
    if not isinstance(recent_dialogue_history, list):
        recent_dialogue_history = dialogue_history if isinstance(dialogue_history, list) else []

    agent_configs = state.get("agent_configs", {})
    jury_config_override = agent_configs.get("jury", agent_configs.get("judge", {}))
    custom_prompt = str(jury_config_override.get("custom_prompt", "") or "")
    reasoning_config = state.get("reasoning_config", {})
    override = jury_config_override if isinstance(jury_config_override, dict) else None
    progress_callback = build_status_heartbeat_callback(
        state,
        node_name="jury_discussion",
        template="陪审团仍在讨论本轮表现，已等待 {seconds} 秒...",
    )

    system_prompt = _build_system_prompt(custom_prompt)
    context_block = build_context_for_agent(
        shared_knowledge=shared_knowledge,
        recent_history=recent_dialogue_history,
        topic=topic,
        current_turn=current_turn,
        max_turns=max_turns,
    )

    current_jury_discussion: list[dict[str, Any]] = []
    jury_history_delta: list[dict[str, Any]] = []

    logger.info(
        "Running jury discussion: jurors=%d rounds=%d turn=%d",
        jurors,
        discussion_rounds,
        current_turn + 1,
    )

    for round_index in range(discussion_rounds):
        for juror_index in range(jurors):
            perspective = _perspective_for(juror_index)
            agent_name = _jury_member_name(juror_index)
            instruction = _build_member_instruction(
                topic=topic,
                current_turn=current_turn,
                max_turns=max_turns,
                agent_name=agent_name,
                perspective=perspective,
                context_block=context_block,
                discussion_history=current_jury_discussion,
                reasoning_config=reasoning_config,
            )
            try:
                content = await invoke_text_model(
                    [
                        SystemMessage(content=system_prompt),
                        HumanMessage(content=instruction),
                    ],
                    override=override,
                    on_progress=progress_callback,
                    timeout_seconds=MODEL_INVOCATION_TIMEOUT_SECONDS,
                    heartbeat_interval_seconds=MODEL_HEARTBEAT_INTERVAL_SECONDS,
                )
                content = normalize_model_text(content)
            except Exception as exc:
                logger.warning(
                    "Jury discussion failed for juror %d round %d: %s",
                    juror_index + 1,
                    round_index + 1,
                    exc,
                )
                content = "本轮陪审意见生成失败，请正式裁判优先依据双方公开发言自行判断。"

            entry = {
                "role": "jury_member",
                "agent_name": agent_name,
                "content": content,
                "citations": [],
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "turn": current_turn,
                "discussion_kind": "jury",
                "jury_round": round_index,
                "jury_member_index": juror_index,
                "jury_perspective": perspective,
            }
            current_jury_discussion.append(entry)
            jury_history_delta.append(entry)

    summary_instruction = _build_summary_instruction(
        topic=topic,
        current_turn=current_turn,
        max_turns=max_turns,
        context_block=context_block,
        discussion_history=current_jury_discussion,
    )
    try:
        summary_content = await invoke_text_model(
            [
                SystemMessage(content=system_prompt),
                HumanMessage(content=summary_instruction),
            ],
            override=override,
            on_progress=progress_callback,
            timeout_seconds=MODEL_INVOCATION_TIMEOUT_SECONDS,
            heartbeat_interval_seconds=MODEL_HEARTBEAT_INTERVAL_SECONDS,
        )
        summary_content = normalize_model_text(summary_content)
    except Exception as exc:
        logger.warning("Jury summary failed: %s", exc)
        summary_content = "本轮陪审总结生成失败，请正式裁判直接根据公开发言评分。"

    summary_entry = {
        "role": "jury_summary",
        "agent_name": _jury_summary_name(),
        "content": summary_content,
        "citations": [],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "turn": current_turn,
        "discussion_kind": "jury",
        "jury_round": discussion_rounds - 1,
    }
    jury_history_delta.append(summary_entry)

    return {
        "jury_dialogue_history": jury_history_delta,
        "current_jury_discussion": current_jury_discussion,
        "current_jury_summary": summary_entry,
    }
