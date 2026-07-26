"""Fact-check node: verify the current turn's factual claims before judging.

The checker itself only plans queries; retrieval reuses the same search
pipeline the debaters' `web_search` tool uses, so both paths share query
planning, result filtering, and evidence formatting.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.agents.config_resolver import resolve_agent_override
from app.agents.live_agent_config import refresh_agent_configs_for_session
from app.agents.prompt_loader import get_fact_checker_prompt
from app.agents.runtime_progress import (
    MODEL_HEARTBEAT_INTERVAL_SECONDS,
    MODEL_INVOCATION_TIMEOUT_SECONDS,
    build_status_heartbeat_callback,
    build_usage_callback,
)
from app.dependencies import get_search_factory
from app.llm.invoke import invoke_text_model
from app.tools.search_formatter import format_evidence_brief
from app.tools.search_query_planner import sanitize_search_query
from app.tools.search_result_filter import filter_results

logger = logging.getLogger(__name__)

MAX_QUERIES_PER_TURN = 3
_MAX_RESULTS_PER_QUERY = 3
_MAX_CLAIM_CHARS = 4000


def _coerce_turn(value: Any, fallback: int) -> int:
    if isinstance(value, bool):
        return fallback
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def collect_turn_speeches(state: dict[str, Any]) -> list[dict[str, Any]]:
    """Return this turn's debater speeches, which are what we fact check."""
    participants = {str(role) for role in state.get("participants", []) or []}
    current_turn = _coerce_turn(state.get("current_turn", 0), 0)
    return [
        entry
        for entry in state.get("dialogue_history", []) or []
        if isinstance(entry, dict)
        and str(entry.get("role", "") or "") in participants
        and _coerce_turn(entry.get("turn", -1), -1) == current_turn
    ]


def parse_query_list(text: str) -> list[str]:
    """Parse the checker's JSON array output, tolerating fenced/prefixed text."""
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    start = cleaned.find("[")
    end = cleaned.rfind("]")
    if start == -1 or end == -1 or start >= end:
        return []
    try:
        parsed = json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []

    queries: list[str] = []
    for item in parsed:
        if not isinstance(item, str):
            continue
        sanitized = sanitize_search_query(item)
        if sanitized and sanitized not in queries:
            queries.append(sanitized)
    return queries[:MAX_QUERIES_PER_TURN]


def _build_instruction(topic: str, speeches: list[dict[str, Any]]) -> str:
    parts = [f"辩题：{topic}", "", "本轮辩手发言："]
    for entry in speeches:
        agent_name = str(entry.get("agent_name", entry.get("role", "")) or "")
        content = str(entry.get("content", "") or "")[:_MAX_CLAIM_CHARS]
        parts.append(f"\n### {agent_name}\n{content}")
    parts.append("\n请提取可验证的事实性陈述，并输出 JSON 数组形式的搜索词。")
    return "\n".join(parts)


async def _run_search(query: str, topic: str) -> str:
    search_factory = get_search_factory()
    results = await search_factory.search(query, num_results=_MAX_RESULTS_PER_QUERY)
    filtered = filter_results(topic, query, results)
    if not filtered:
        return ""
    return format_evidence_brief(topic=query, search_plan=[query], grouped_results=[(query, filtered)])


async def fact_check_turn(state: dict[str, Any]) -> dict[str, Any]:
    """LangGraph node: plan and run fact checks for the current turn."""
    topic = str(state.get("topic", "") or "")
    current_turn = _coerce_turn(state.get("current_turn", 0), 0)
    speeches = collect_turn_speeches(state)
    if not speeches:
        return {"shared_knowledge": []}

    agent_configs = await refresh_agent_configs_for_session(state)
    override = resolve_agent_override(agent_configs, "fact_checker")
    progress_callback = build_status_heartbeat_callback(
        state,
        node_name="fact_check",
        template="事实核查员仍在核对本轮论据，已等待 {seconds} 秒...",
    )

    try:
        response = await invoke_text_model(
            [
                SystemMessage(content=get_fact_checker_prompt()),
                HumanMessage(content=_build_instruction(topic, speeches)),
            ],
            override=override,
            on_progress=progress_callback,
            on_usage=build_usage_callback(state, node_name="fact_check", role="fact_checker"),
            timeout_seconds=MODEL_INVOCATION_TIMEOUT_SECONDS,
            heartbeat_interval_seconds=MODEL_HEARTBEAT_INTERVAL_SECONDS,
        )
    except Exception as exc:
        # Fact checking is an enhancement: never fail the debate over it.
        logger.warning("Fact-check query planning failed for turn %d: %s", current_turn + 1, exc)
        return {"shared_knowledge": []}

    queries = parse_query_list(response)
    if not queries:
        logger.info("Fact checker found no verifiable claims in turn %d", current_turn + 1)
        return {"shared_knowledge": []}

    knowledge: list[dict[str, Any]] = []
    for query in queries:
        try:
            brief = await _run_search(query, topic)
        except Exception as exc:
            logger.warning("Fact-check search failed for '%s': %s", query, exc)
            continue
        if not brief:
            continue
        knowledge.append(
            {
                "type": "fact",
                "query": query,
                "result": brief[:500] + ("..." if len(brief) > 500 else ""),
                "source_kind": "fact_checker",
                "source_role": "fact_checker",
                "source_agent_name": "事实核查员",
                "source_turn": current_turn,
            }
        )

    logger.info(
        "Fact checker produced %d evidence entries for turn %d",
        len(knowledge),
        current_turn + 1,
    )
    return {"shared_knowledge": knowledge}
