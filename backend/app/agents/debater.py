"""
Debater node — generates debate arguments using LLM.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.agents.llm import get_debater_llm
from app.agents.prompt_loader import get_debater_system_prompt
from app.agents.context_manager import build_context_for_agent

logger = logging.getLogger(__name__)

_ROLE_NAMES = {
    "proposer": "正方 (Proposer)",
    "opposer": "反方 (Opposer)",
}


def _extract_citations(text: str) -> list[str]:
    """Extract URLs from text."""
    url_pattern = r"https?://[^\s\)\]\>\"']+"
    return list(set(re.findall(url_pattern, text)))


async def debater_speak(state: dict[str, Any]) -> dict[str, Any]:
    """
    LangGraph node: The current speaker generates their argument.

    Reads: topic, current_speaker, dialogue_history, context_summary, search_context
    Writes: dialogue_history (appends new entry)
    """
    role = state["current_speaker"]
    topic = state["topic"]
    current_turn = state["current_turn"]
    max_turns = state["max_turns"]
    dialogue_history = state.get("dialogue_history", [])
    context_summary = state.get("context_summary", "")
    search_context = state.get("search_context", [])

    logger.info("Debater [%s] speaking — Turn %d/%d", role, current_turn + 1, max_turns)

    # Build system prompt
    system_prompt = get_debater_system_prompt(role)

    # Build context
    context_block = build_context_for_agent(
        context_summary=context_summary,
        recent_history=dialogue_history,
        search_context=search_context,
        topic=topic,
        current_turn=current_turn,
        max_turns=max_turns,
    )

    # Determine the instruction based on turn and role
    is_first_turn = current_turn == 0
    is_proposer = role == "proposer"

    if is_first_turn and is_proposer:
        instruction = (
            f"You are the {_ROLE_NAMES.get(role, role)}.\n"
            f"This is your OPENING STATEMENT. Present your thesis and opening arguments "
            f"on the topic: \"{topic}\"\n\n{context_block}"
        )
    elif is_first_turn and not is_proposer:
        instruction = (
            f"You are the {_ROLE_NAMES.get(role, role)}.\n"
            f"The Proposer has made their opening statement. "
            f"Present your counter-thesis and respond to their arguments "
            f"on the topic: \"{topic}\"\n\n{context_block}"
        )
    else:
        instruction = (
            f"You are the {_ROLE_NAMES.get(role, role)}.\n"
            f"This is Turn {current_turn + 1} of {max_turns}. "
            f"Respond to the latest arguments, reinforce your position, "
            f"and address any weaknesses in your opponent's case.\n\n{context_block}"
        )

    # Call LLM
    agent_configs = state.get("agent_configs", {})
    override = agent_configs.get(role, agent_configs.get("debater"))
    llm = get_debater_llm(streaming=False, override=override)
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=instruction),
    ]

    response = await llm.ainvoke(messages)
    content = response.content.strip()
    citations = _extract_citations(content)

    # Create dialogue entry
    entry = {
        "role": role,
        "agent_name": _ROLE_NAMES.get(role, role),
        "content": content,
        "citations": citations,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    logger.info(
        "Debater [%s] finished — %d chars, %d citations",
        role, len(content), len(citations),
    )

    return {"dialogue_history": [entry]}
