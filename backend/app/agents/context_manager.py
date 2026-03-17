"""
Context window manager — implements sliding window + summary compression
to keep dialogue within LLM token limits.
"""

from __future__ import annotations

import logging
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.agents.llm import get_fact_checker_llm
from app.config import get_settings

logger = logging.getLogger(__name__)
_MEMO_PROMPT = """You are a debate archivist. Condense the following dialogue message into a concise "Memo" (1-2 sentences).
Preserve the core argument, key evidence, and the logical stance.
Omit conversational filler. Do NOT add your own commentary.

MESSAGE TO COMPRESS:
[{role}]: {content}

OUTPUT a single concise statement representing their point:"""


async def compress_context(
    dialogue_history: list[dict[str, Any]],
    shared_knowledge: list[dict[str, Any]],
    agent_configs: dict[str, Any] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Apply single-message compression for old dialogue.
    Moves messages older than `keep_entries` into `shared_knowledge` as "memo" types.

    Returns:
        (updated_shared_knowledge, recent_entries_to_keep)
    """
    settings = get_settings()
    ctx_cfg = settings.debate.context_window

    if not ctx_cfg.enable_summary_compression:
        return shared_knowledge, dialogue_history

    keep_entries = ctx_cfg.recent_turns_to_keep * 2 

    if len(dialogue_history) <= keep_entries:
        return shared_knowledge, dialogue_history

    old_entries = dialogue_history[:-keep_entries]
    recent_entries = dialogue_history[-keep_entries:]

    new_knowledge = list(shared_knowledge)
    override = (agent_configs or {}).get("fact_checker")
    llm = await get_fact_checker_llm(streaming=False, override=override)

    for entry in old_entries:
        # Skip if it's already a compressed memo or system message
        if entry.get("role") == "system" or entry.get("type") == "memo":
            continue

        role = entry.get("role", "unknown")
        agent_name = entry.get("agent_name", role)
        content = entry.get("content", "")

        try:
            prompt = _MEMO_PROMPT.format(role=agent_name, content=content)
            response = await llm.ainvoke([
                SystemMessage(content="You are a concise archivist. Output only the short memo."),
                HumanMessage(content=prompt),
            ])
            response_content = response.content if hasattr(response, 'content') else str(response)
            summary = response_content.strip() if isinstance(response_content, str) else str(response_content)
            
            # Append as a memo to shared knowledge
            new_knowledge.append({
                "type": "memo",
                "role": role,
                "agent_name": agent_name,
                "content": summary,
            })
            logger.info("Compressed message from %s into memo.", agent_name)
        except Exception as exc:
            logger.error("Failed to compress message from %s: %s", agent_name, exc)

    return new_knowledge, recent_entries


def build_context_for_agent(
    shared_knowledge: list[dict[str, Any]],
    recent_history: list[dict[str, Any]],
    topic: str,
    current_turn: int,
    max_turns: int,
) -> str:
    """
    Build the full context block injected into agent prompts.
    Combines: shared knowledge (facts & memos) + recent verbatim dialogue.
    """
    parts: list[str] = []

    # Metadata
    parts.append(f"## Debate Topic\n{topic}")
    parts.append(f"## Progress\nTurn {current_turn + 1} of {max_turns}")

    # Shared Knowledge Base
    if shared_knowledge:
        parts.append("## Shared Knowledge Base (Memos & Facts)")
        lines = []
        for item in shared_knowledge:
            i_type = item.get("type", "memo")
            if i_type == "memo":
                agent_name = item.get("agent_name", item.get("role", "unknown"))
                content = item.get("content", "")
                lines.append(f"- [Historical Memo - {agent_name}]: {content}")
            elif i_type == "fact":
                query = item.get("query", "")
                result = item.get("result", "")
                lines.append(f"- [Verified Fact for '{query}']: {result}")
        parts.append("\n".join(lines))

    # Recent dialogue
    if recent_history:
        parts.append("## Recent Exact Dialogue")
        lines = []
        for entry in recent_history:
            role = entry.get("role", "unknown")
            agent_name = entry.get("agent_name", role)
            content = entry.get("content", "")
            lines.append(f"**[{agent_name}]**: {content}")
        parts.append("\n\n".join(lines))

    return "\n\n".join(parts)
