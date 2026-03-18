"""
Context window manager implementing sliding-window summary compression.
"""

from __future__ import annotations

import logging
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.agents.safe_invoke import invoke_text_model
from app.config import get_settings

logger = logging.getLogger(__name__)

_MEMO_PROMPT = """You are a debate archivist. Condense the following dialogue message into a concise memo in 1-2 sentences.
Preserve the core argument, key evidence, and logical stance.
Do not add your own commentary.

MESSAGE TO COMPRESS:
[{role}]: {content}

OUTPUT:
"""


async def compress_context(
    dialogue_history: list[dict[str, Any]],
    shared_knowledge: list[dict[str, Any]],
    agent_configs: dict[str, Any] | None = None,
    *,
    compressed_history_count: int = 0,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], int]:
    """
    Compress older dialogue entries into shared knowledge memo entries.

    Returns:
        (updated_shared_knowledge, recent_entries_to_keep)
    """
    settings = get_settings()
    ctx_cfg = settings.debate.context_window

    if not ctx_cfg.enable_summary_compression:
        return shared_knowledge, dialogue_history, compressed_history_count

    keep_entries = ctx_cfg.recent_turns_to_keep * 2
    if len(dialogue_history) <= keep_entries:
        return shared_knowledge, dialogue_history, compressed_history_count

    compress_upto = max(0, len(dialogue_history) - keep_entries)
    if compress_upto <= compressed_history_count:
        return shared_knowledge, dialogue_history[compress_upto:], compressed_history_count

    old_entries = dialogue_history[compressed_history_count:compress_upto]
    recent_entries = dialogue_history[compress_upto:]
    new_knowledge = list(shared_knowledge)
    override = (agent_configs or {}).get("fact_checker")

    for entry in old_entries:
        if entry.get("role") == "system" or entry.get("type") == "memo":
            continue

        role = entry.get("role", "unknown")
        agent_name = entry.get("agent_name", role)
        content = entry.get("content", "")

        try:
            prompt = _MEMO_PROMPT.format(role=agent_name, content=content)
            summary = await invoke_text_model(
                [
                    SystemMessage(
                        content="You are a concise archivist. Output only the short memo."
                    ),
                    HumanMessage(content=prompt),
                ],
                override=override,
            )
            new_knowledge.append(
                {
                    "type": "memo",
                    "role": role,
                    "agent_name": agent_name,
                    "content": summary,
                    "source_kind": "dialogue",
                    "source_timestamp": str(entry.get("timestamp", "") or ""),
                    "source_role": role,
                    "source_agent_name": agent_name,
                    "source_excerpt": content[:180],
                }
            )
            logger.info("Compressed message from %s into memo.", agent_name)
        except Exception as exc:
            logger.error("Failed to compress message from %s: %s", agent_name, exc)

    return new_knowledge, recent_entries, compress_upto


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

    if shared_knowledge:
        parts.append("## Shared Knowledge Base (Memos and Facts)")
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
        parts.append("\n".join(knowledge_lines))

    if recent_history:
        parts.append("## Recent Exact Dialogue")
        recent_lines: list[str] = []
        for entry in recent_history:
            agent_name = entry.get("agent_name", entry.get("role", "unknown"))
            content = entry.get("content", "")
            recent_lines.append(f"**[{agent_name}]**: {content}")
        parts.append("\n\n".join(recent_lines))

    return "\n\n".join(parts)
