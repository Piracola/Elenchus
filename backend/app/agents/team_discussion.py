"""
Internal per-side team discussion helpers.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.agents.context_builder import build_context_for_agent
from app.agents.prompt_loader import get_debater_system_prompt
from app.agents.runtime_progress import (
    MODEL_HEARTBEAT_INTERVAL_SECONDS,
    MODEL_INVOCATION_TIMEOUT_SECONDS,
    build_status_heartbeat_callback,
)
from app.llm.invoke import invoke_text_model, normalize_model_text
from app.constants import ROLE_LABELS, ROLE_NAMES

logger = logging.getLogger(__name__)

_TEAM_SPECIALTIES = [
    "策略统筹",
    "证据审查",
    "反驳设计",
    "风险排查",
    "价值框架",
    "案例构造",
    "逻辑校验",
    "交叉质询",
    "公众说服",
    "收束整合",
]

_TEAM_RULES = """
## Internal Team Rules
- Reply in Chinese.
- You are speaking only to your own side's internal team, not the audience.
- Focus on strategy, evidence, vulnerabilities, and rebuttal opportunities.
- Be concise and concrete. Prefer 3-5 short bullet points.
- Do not use external tools in the internal discussion phase.
""".strip()


def _team_agent_name(side: str, index: int) -> str:
    side_label = ROLE_LABELS.get(side, side)
    return f"{side_label}组员{index + 1}"


def _team_summary_name(side: str) -> str:
    side_label = ROLE_LABELS.get(side, side)
    return f"{side_label}总结员"


def _specialty_for(index: int) -> str:
    return _TEAM_SPECIALTIES[index % len(_TEAM_SPECIALTIES)]


def _build_discussion_history_block(entries: list[dict[str, Any]]) -> str:
    if not entries:
        return ""

    lines = ["## Current Internal Discussion"]
    for entry in entries:
        agent_name = str(entry.get("agent_name", entry.get("role", "组员")) or "组员")
        specialty = str(entry.get("team_specialty", "") or "")
        prefix = f"{agent_name}"
        if specialty:
            prefix += f"（{specialty}）"
        lines.append(f"- {prefix}: {entry.get('content', '')}")
    return "\n".join(lines)


def _build_reasoning_directives(reasoning_config: dict[str, Any]) -> list[str]:
    directives: list[str] = []
    if bool(reasoning_config.get("steelman_enabled", True)):
        directives.append("先用最强版本还原对手当前最有威胁的论点，再给出反驳。")
    if bool(reasoning_config.get("counterfactual_enabled", True)):
        directives.append("至少加入一个反事实推演，说明若关键前提变化，本方论证会如何调整。")
    return directives


def _build_member_instruction(
    *,
    side: str,
    agent_name: str,
    specialty: str,
    topic: str,
    current_turn: int,
    max_turns: int,
    context_block: str,
    discussion_history: list[dict[str, Any]],
    reasoning_config: dict[str, Any],
) -> str:
    side_name = ROLE_NAMES.get(side, side)
    discussion_block = _build_discussion_history_block(discussion_history)
    parts = [
        f"你是 {side_name} 内部讨论小组成员，名字是「{agent_name}」。",
        f"你的专长是：{specialty}。",
        f"当前是第 {current_turn + 1} / {max_turns} 回合，辩题是：{topic}。",
        "请从你的专长视角，为本方正式辩手提供可执行建议。",
        "重点回答：本方最该强化什么、最该反驳什么、最需要规避什么。",
        context_block,
    ]
    if discussion_block:
        parts.append(discussion_block)
    parts.extend(_build_reasoning_directives(reasoning_config))
    return "\n\n".join(part for part in parts if part)


def _build_summary_instruction(
    *,
    side: str,
    topic: str,
    current_turn: int,
    max_turns: int,
    context_block: str,
    discussion_history: list[dict[str, Any]],
    reasoning_config: dict[str, Any],
) -> str:
    side_name = ROLE_NAMES.get(side, side)
    discussion_block = _build_discussion_history_block(discussion_history)
    extra_directives = _build_reasoning_directives(reasoning_config)
    return "\n\n".join(
        part
        for part in [
            f"你是 {side_name} 的内部总结员。",
            f"当前是第 {current_turn + 1} / {max_turns} 回合，辩题是：{topic}。",
            "请基于组内讨论，输出一份供正式辩手使用的内部总结。",
            "格式要求：",
            "1. 先给出“本方核心主张”",
            "2. 再给出“优先反驳点”",
            "3. 再给出“风险提醒”",
            "4. 最后给出“建议成稿方向”",
            "不要写给观众看的完整演讲稿，而是写给本方正式辩手的内部 briefing。",
            context_block,
            discussion_block,
            *extra_directives,
        ]
        if part
    )


def _build_system_prompt(side: str, custom_prompt: str) -> str:
    system_prompt = get_debater_system_prompt(side)
    system_prompt += f"\n\n{_TEAM_RULES}"
    if custom_prompt:
        system_prompt += f"\n\n## Custom Persona Instructions\n{custom_prompt}"
    return system_prompt


async def team_discuss(state: dict[str, Any]) -> dict[str, Any]:
    """Run one side's internal team discussion before the public speech."""
    side = str(state.get("current_speaker", "") or "")
    team_config = state.get("team_config", {})
    agents_per_team = int(team_config.get("agents_per_team", 0) or 0)
    discussion_rounds = int(team_config.get("discussion_rounds", 0) or 0)

    if not side or agents_per_team <= 0 or discussion_rounds <= 0:
        return {
            "current_team_discussion": [],
            "current_team_summary": None,
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
    side_config = agent_configs.get(side, agent_configs.get("debater", {}))
    custom_prompt = str(side_config.get("custom_prompt", "") or "")
    override = side_config if isinstance(side_config, dict) else None
    reasoning_config = state.get("reasoning_config", {})
    progress_callback = build_status_heartbeat_callback(
        state,
        node_name="team_discussion",
        template="组内讨论仍在生成，已等待 {seconds} 秒...",
    )

    system_prompt = _build_system_prompt(side, custom_prompt)
    context_block = build_context_for_agent(
        shared_knowledge=shared_knowledge,
        recent_history=recent_dialogue_history,
        topic=topic,
        current_turn=current_turn,
        max_turns=max_turns,
        agent_role=side,
        judge_history=state.get("judge_history", []),
    )

    current_team_discussion: list[dict[str, Any]] = []
    team_history_delta: list[dict[str, Any]] = []

    logger.info(
        "Running internal team discussion for [%s]: agents=%d rounds=%d",
        side,
        agents_per_team,
        discussion_rounds,
    )

    for round_index in range(discussion_rounds):
        for member_index in range(agents_per_team):
            specialty = _specialty_for(member_index)
            agent_name = _team_agent_name(side, member_index)
            instruction = _build_member_instruction(
                side=side,
                agent_name=agent_name,
                specialty=specialty,
                topic=topic,
                current_turn=current_turn,
                max_turns=max_turns,
                context_block=context_block,
                discussion_history=current_team_discussion,
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
                    "Internal team discussion failed for [%s] member %d round %d: %s",
                    side,
                    member_index + 1,
                    round_index + 1,
                    exc,
                )
                content = "本轮内部建议生成失败，请正式辩手优先沿用既有论点并谨慎回应对手。"

            entry = {
                "role": "team_member",
                "agent_name": agent_name,
                "content": content,
                "citations": [],
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "turn": current_turn,
                "discussion_kind": "team",
                "team_side": side,
                "team_round": round_index,
                "team_member_index": member_index,
                "team_specialty": specialty,
                "source_role": side,
            }
            current_team_discussion.append(entry)
            team_history_delta.append(entry)

    summary_instruction = _build_summary_instruction(
        side=side,
        topic=topic,
        current_turn=current_turn,
        max_turns=max_turns,
        context_block=context_block,
        discussion_history=current_team_discussion,
        reasoning_config=reasoning_config,
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
        logger.warning("Internal team summary failed for [%s]: %s", side, exc)
        summary_content = "本轮内部总结生成失败，请正式辩手基于既有上下文自行组织回应。"

    summary_entry = {
        "role": "team_summary",
        "agent_name": _team_summary_name(side),
        "content": summary_content,
        "citations": [],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "turn": current_turn,
        "discussion_kind": "team",
        "team_side": side,
        "team_round": discussion_rounds - 1,
        "source_role": side,
    }
    team_history_delta.append(summary_entry)

    return {
        "team_dialogue_history": team_history_delta,
        "current_team_discussion": current_team_discussion,
        "current_team_summary": summary_entry,
    }
