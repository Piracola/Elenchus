"""
Helpers for constructing prompt context blocks for debate agents.
"""

from __future__ import annotations

from typing import Any


def _build_shared_knowledge_section(shared_knowledge: list[dict[str, Any]]) -> str | None:
    if not shared_knowledge:
        return None

    knowledge_lines: list[str] = []
    for item in shared_knowledge:
        item_type = item.get("type", "memo")
        if item_type == "memo":
            agent_name = item.get("agent_name", item.get("role", "unknown"))
            content = item.get("content", "")
            knowledge_lines.append(f"- [Historical Memo - {agent_name}]: {content}")
        elif item_type == "fact":
            query = item.get("query", "")
            result = item.get("result", "")
            knowledge_lines.append(f"- [Verified Fact for '{query}']: {result}")

    if not knowledge_lines:
        return None
    return "## Shared Knowledge Base (Memos and Facts)\n" + "\n".join(knowledge_lines)


def _build_recent_history_section(recent_history: list[dict[str, Any]]) -> str | None:
    if not recent_history:
        return None

    recent_lines: list[str] = []
    for entry in recent_history:
        agent_name = entry.get("agent_name", entry.get("role", "unknown"))
        content = entry.get("content", "")
        recent_lines.append(f"**[{agent_name}]**: {content}")

    return "## Recent Exact Dialogue\n" + "\n\n".join(recent_lines)


def build_context_for_agent(
    shared_knowledge: list[dict[str, Any]],
    recent_history: list[dict[str, Any]],
    topic: str,
    current_turn: int,
    max_turns: int,
) -> str:
    """
    Build the context block injected into agent prompts.

    Combines shared knowledge (facts and memos) with recent verbatim dialogue.
    """
    parts: list[str] = [
        f"## Debate Topic\n{topic}",
        f"## Progress\nTurn {current_turn + 1} of {max_turns}",
    ]

    shared_knowledge_section = _build_shared_knowledge_section(shared_knowledge)
    if shared_knowledge_section:
        parts.append(shared_knowledge_section)

    recent_history_section = _build_recent_history_section(recent_history)
    if recent_history_section:
        parts.append(recent_history_section)

    return "\n\n".join(parts)
