"""
Debater node that generates the next argument for the current speaker.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any

from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langgraph.graph.message import RemoveMessage

from app.agents.context_builder import build_context_for_agent
from app.agents.prompt_loader import get_debater_system_prompt
from app.agents.safe_invoke import (
    extract_text_content,
    invoke_chat_model,
    invoke_text_model,
    normalize_model_text,
)
from app.agents.skills import get_all_skills
from app.constants import ROLE_NAMES

logger = logging.getLogger(__name__)

_TOOL_RULES = """
## Tool Rules
- Reply in Chinese.
- Use `web_search` only to verify a concrete fact, statistic, date, policy, law, or case.
- Never search for the whole prompt, role instructions, or text like "You are ...", "opening statement", or "turn X of Y".
- Search queries must be concise factual keywords or just the debate topic; the tool will plan sub-queries on its own.
- After using a tool, write the debate speech itself. Do not output "I'll search for", raw search results, URL lists, or long source dumps.
""".strip()


def _build_team_summary_block(team_summary: Any) -> str:
    if not isinstance(team_summary, dict):
        return ""

    content = team_summary.get("content")
    if not isinstance(content, str) or not content.strip():
        return ""

    agent_name = str(team_summary.get("agent_name", "内部总结员") or "内部总结员")
    return f"## Internal Team Briefing\n[{agent_name}]\n{content.strip()}"


def _extract_citations(text: str) -> list[str]:
    """Extract URLs from text."""
    url_pattern = r"https?://[^\s\)\]\>\"']+"
    return list(set(re.findall(url_pattern, text)))


def _count_tool_rounds(messages: list[BaseMessage]) -> int:
    """Count how many tool messages are already in the current scratchpad."""
    return sum(1 for message in messages if getattr(message, "type", "") == "tool")


def _looks_like_search_dump(text: str) -> bool:
    """Detect model outputs that are really search transcripts instead of speeches."""
    lowered = text.lower()
    return (
        "i'll search for" in lowered
        or "here are the search results for" in lowered
        or lowered.startswith("search results for")
        or text.count("http://") + text.count("https://") >= 2
        or lowered.count("source:") >= 2
    )


async def _repair_search_dump(
    payload_messages: list[BaseMessage],
    override: dict[str, Any] | None,
) -> str:
    """Ask the model to convert gathered evidence into an actual debate speech."""
    repaired = await invoke_text_model(
        [
            *payload_messages,
            HumanMessage(
                content=(
                    "You already have enough evidence. Now write only the final debate speech in Chinese. "
                    "Do not narrate searches, do not include raw search results, and do not output URLs or source lists."
                )
            ),
        ],
        override=override,
        tools=None,
    )
    return normalize_model_text(repaired)


async def debater_speak(state: dict[str, Any]) -> dict[str, Any]:
    """
    LangGraph node: the current speaker generates their argument.

    Reads: topic, current_speaker, dialogue_history, shared_knowledge, messages
    Writes: dialogue_history and transient tool messages
    """
    role = state["current_speaker"]
    topic = state["topic"]
    current_turn = state["current_turn"]
    max_turns = state["max_turns"]

    dialogue_history = state.get("dialogue_history", [])
    recent_dialogue_history = state.get("recent_dialogue_history", dialogue_history)
    if not isinstance(recent_dialogue_history, list):
        recent_dialogue_history = dialogue_history if isinstance(dialogue_history, list) else []
    shared_knowledge = state.get("shared_knowledge", [])
    messages = state.get("messages", [])
    agent_configs = state.get("agent_configs", {})

    role_config = agent_configs.get(role, {})
    agent_name = role_config.get("custom_name", ROLE_NAMES.get(role, role))
    custom_prompt = role_config.get("custom_prompt", "")
    tool_rounds = _count_tool_rounds(messages)

    logger.info(
        "Debater [%s] ('%s') speaking - turn %d/%d",
        role,
        agent_name,
        current_turn + 1,
        max_turns,
    )

    system_prompt = get_debater_system_prompt(role)
    system_prompt += f"\n\n{_TOOL_RULES}"
    if custom_prompt:
        system_prompt += f"\n\n## Custom Persona Instructions\n{custom_prompt}"

    context_block = build_context_for_agent(
        shared_knowledge=shared_knowledge,
        recent_history=recent_dialogue_history,
        topic=topic,
        current_turn=current_turn,
        max_turns=max_turns,
    )
    team_summary_block = _build_team_summary_block(state.get("current_team_summary"))
    if team_summary_block:
        context_block = f"{context_block}\n\n{team_summary_block}" if context_block else team_summary_block

    is_first_turn = current_turn == 0
    is_proposer = role == "proposer"

    if is_first_turn and is_proposer:
        instruction = (
            f"你是 {agent_name}。\n"
            f"这是你的开场陈词。请围绕辩题“{topic}”提出核心论点与论证。\n\n{context_block}"
        )
    elif is_first_turn:
        instruction = (
            f"你是 {agent_name}。\n"
            f"正方已经完成开场陈词。请围绕辩题“{topic}”提出反论点并回应对方。\n\n{context_block}"
        )
    else:
        instruction = (
            f"你是 {agent_name}。\n"
            f"当前是第 {current_turn + 1} / {max_turns} 回合。请回应最新论点，巩固己方立场，并针对对手漏洞展开反驳。\n\n{context_block}"
        )

    payload_messages: list[BaseMessage] = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=instruction),
    ]
    if messages:
        payload_messages.extend(messages)

    if tool_rounds >= 2:
        payload_messages.append(
            HumanMessage(
                content=(
                    "你已经获得足够证据，不要再调用工具。现在直接给出最终发言，且不要输出搜索过程、URL 或资料列表。"
                )
            )
        )

    override = agent_configs.get(role, agent_configs.get("debater"))
    skills = list(get_all_skills()) if tool_rounds < 2 else []
    response = await invoke_chat_model(
        payload_messages,
        override=override,
        tools=skills or None,
    )

    if hasattr(response, "tool_calls") and response.tool_calls:
        logger.info(
            "Debater [%s] requested tools: %s",
            role,
            [call["name"] for call in response.tool_calls],
        )
        return {"messages": [response]}

    response_content = response.content if hasattr(response, "content") else response
    content = normalize_model_text(extract_text_content(response_content))

    if _looks_like_search_dump(content):
        logger.warning(
            "Debater [%s] produced a search dump instead of a speech; triggering repair pass.",
            role,
        )
        try:
            content = await _repair_search_dump(payload_messages, override)
        except Exception as exc:
            logger.warning("Repair pass failed for [%s]: %s", role, exc)

    citations = _extract_citations(content)

    entry = {
        "role": role,
        "agent_name": agent_name,
        "content": content,
        "citations": citations,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    logger.info(
        "Debater [%s] finished speech - %d chars, %d citations",
        role,
        len(content),
        len(citations),
    )

    return {
        "dialogue_history": [entry],
        "recent_dialogue_history": [*recent_dialogue_history, entry],
        "messages": [RemoveMessage(id=message.id) for message in messages if message.id],
    }
