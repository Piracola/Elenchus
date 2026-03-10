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

_SUMMARY_PROMPT = """You are a debate summariser. Condense the following older dialogue turns into a concise summary that preserves:
1. Each participant's core thesis / position
2. Key arguments and counter-arguments made
3. Important evidence or citations referenced
4. Any logical weaknesses or contradictions identified

Be factual and neutral. Do NOT add commentary.

OLDER DIALOGUE:
{dialogue_text}

OUTPUT a concise summary in bullet-point form."""


def build_dialogue_text(entries: list[dict[str, Any]]) -> str:
    """Format dialogue entries into readable text."""
    lines = []
    for entry in entries:
        role = entry.get("role", "unknown")
        content = entry.get("content", "")
        lines.append(f"[{role}]: {content}")
    return "\n\n".join(lines)


async def compress_context(
    dialogue_history: list[dict[str, Any]],
    existing_summary: str,
) -> tuple[str, list[dict[str, Any]]]:
    """
    Apply sliding window + summary compression.

    Returns:
        (updated_summary, recent_entries_to_keep)
    """
    settings = get_settings()
    ctx_cfg = settings.debate.context_window

    if not ctx_cfg.enable_summary_compression:
        return existing_summary, dialogue_history

    # Count "full rounds" — each participant speaks once per round
    n_participants = 2  # Will be dynamic later
    entries_per_round = n_participants  # Each speaker once per round
    keep_entries = ctx_cfg.recent_turns_to_keep * entries_per_round

    if len(dialogue_history) <= keep_entries:
        # Not enough history to warrant compression
        return existing_summary, dialogue_history

    # Split into old (to compress) and recent (to keep verbatim)
    old_entries = dialogue_history[:-keep_entries]
    recent_entries = dialogue_history[-keep_entries:]

    # Build text of old entries for summarisation
    old_text = build_dialogue_text(old_entries)
    if existing_summary:
        old_text = f"PREVIOUS SUMMARY:\n{existing_summary}\n\nNEW ENTRIES TO INCORPORATE:\n{old_text}"

    # Call LLM to generate summary
    try:
        llm = get_fact_checker_llm(streaming=False)  # Use lightweight model
        prompt = _SUMMARY_PROMPT.format(dialogue_text=old_text)
        response = await llm.ainvoke([
            SystemMessage(content="You are a concise summariser."),
            HumanMessage(content=prompt),
        ])
        new_summary = response.content.strip()
        logger.info(
            "Context compressed: %d old entries → summary (%d chars)",
            len(old_entries), len(new_summary),
        )
        return new_summary, recent_entries
    except Exception as exc:
        logger.error("Context compression failed: %s — keeping full history", exc)
        return existing_summary, dialogue_history


def build_context_for_agent(
    context_summary: str,
    recent_history: list[dict[str, Any]],
    search_context: list[dict[str, Any]],
    topic: str,
    current_turn: int,
    max_turns: int,
) -> str:
    """
    Build the full context block injected into agent prompts.
    Combines: summary of old turns + recent dialogue + search results.
    """
    parts: list[str] = []

    # Metadata
    parts.append(f"## Debate Topic\n{topic}")
    parts.append(f"## Progress\nTurn {current_turn + 1} of {max_turns}")

    # Historical summary
    if context_summary:
        parts.append(f"## Summary of Earlier Rounds\n{context_summary}")

    # Recent dialogue
    if recent_history:
        lines = []
        for entry in recent_history:
            role = entry.get("role", "unknown")
            content = entry.get("content", "")
            lines.append(f"**[{role}]**: {content}")
        parts.append(f"## Recent Dialogue\n" + "\n\n".join(lines))

    # Search context
    if search_context:
        lines = []
        for result in search_context:
            title = result.get("title", "")
            url = result.get("url", "")
            snippet = result.get("snippet", "")
            lines.append(f"- **{title}** ({url})\n  {snippet}")
        parts.append(f"## Fact-Check Search Results\n" + "\n".join(lines))

    return "\n\n".join(parts)
