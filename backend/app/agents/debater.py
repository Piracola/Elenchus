"""
Debater node — generates debate arguments using LLM.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage, BaseMessage, AIMessage

from app.agents.llm import get_debater_llm
from app.agents.prompt_loader import get_debater_system_prompt
from app.agents.context_manager import build_context_for_agent
from app.agents.skills import get_all_skills
from app.constants import ROLE_NAMES

logger = logging.getLogger(__name__)


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
    shared_knowledge = state.get("shared_knowledge", [])
    messages = state.get("messages", [])
    agent_configs = state.get("agent_configs", {})
    
    # Custom persona overrides
    role_config = agent_configs.get(role, {})
    agent_name = role_config.get("custom_name", ROLE_NAMES.get(role, role))
    custom_prompt = role_config.get("custom_prompt", "")

    logger.info("Debater [%s] ('%s') speaking — Turn %d/%d", role, agent_name, current_turn + 1, max_turns)

    # Build system prompt
    system_prompt = get_debater_system_prompt(role)
    if custom_prompt:
        system_prompt += f"\n\n## Custom Persona Instructions\n{custom_prompt}"

    # Build context
    context_block = build_context_for_agent(
        shared_knowledge=shared_knowledge,
        recent_history=dialogue_history,
        topic=topic,
        current_turn=current_turn,
        max_turns=max_turns,
    )

    # Determine the instruction based on turn and role
    is_first_turn = current_turn == 0
    is_proposer = role == "proposer"

    if is_first_turn and is_proposer:
        instruction = (
            f"You are {agent_name}.\n"
            f"This is your OPENING STATEMENT. Present your thesis and opening arguments "
            f"on the topic: \"{topic}\"\n\n{context_block}"
        )
    elif is_first_turn and not is_proposer:
        instruction = (
            f"You are {agent_name}.\n"
            f"The Proposer has made their opening statement. "
            f"Present your counter-thesis and respond to their arguments "
            f"on the topic: \"{topic}\"\n\n{context_block}"
        )
    else:
        instruction = (
            f"You are {agent_name}.\n"
            f"This is Turn {current_turn + 1} of {max_turns}. "
            f"Respond to the latest arguments, reinforce your position, "
            f"and address any weaknesses in your opponent's case.\n\n{context_block}"
        )

    # Bind skills (tools)
    override = agent_configs.get(role, agent_configs.get("debater"))
    llm = get_debater_llm(streaming=False, override=override)
    skills = get_all_skills()
    if skills:
        llm = llm.bind_tools(skills)
        
    # Build complete message payload (System + Internal Tool Scratchpad)
    payload_messages: list[BaseMessage] = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=instruction),
    ]
    # Append tool execution results if we are looping in same turn
    if messages:
        payload_messages.extend(messages)

    response = await llm.ainvoke(payload_messages)
    
    # Check if the LLM decided to call a tool
    if hasattr(response, "tool_calls") and response.tool_calls:
        logger.info("Debater [%s] requested tools: %s", role, [t["name"] for t in response.tool_calls])
        return {"messages": [response]} # Yield back to graph to route to tool_executor

    content = response.content.strip() if isinstance(response.content, str) else str(response.content)
    citations = _extract_citations(content)

    # Create dialogue entry
    entry = {
        "role": role,
        "agent_name": agent_name,
        "content": content,
        "citations": citations,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    logger.info(
        "Debater [%s] finished speech — %d chars, %d citations",
        role, len(content), len(citations),
    )

    # Clear `messages` scratchpad, push the result to `dialogue_history`
    return {"dialogue_history": [entry], "messages": []}
