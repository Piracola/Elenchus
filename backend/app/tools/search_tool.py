"""
Unified web search tool for agents.

The tool accepts either a concise fact query or a full debate topic. For
debate topics it automatically plans several targeted searches, filters
obviously irrelevant results, and returns a compact evidence brief that the
model can synthesize into an argument.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from app.config import get_settings
from app.tools.metadata import mark_tool_shared_knowledge
from app.tools.search_formatter import format_evidence_brief
from app.tools.search_query_planner import (
    MAX_QUERY_CHARS,
    build_search_plan,
    sanitize_search_query,
)
from app.tools.search_result_filter import filter_results
from app.dependencies import get_search_factory
from app.search.base import SearchResult

logger = logging.getLogger(__name__)

_MAX_RESULTS_PER_QUERY = 3


class SearchInput(BaseModel):
    """Input schema for web search tool."""

    query: str = Field(
        description=(
            "A concise factual web search query or a debate topic. For debate "
            "topics, the tool will plan a few focused sub-queries for laws, data, "
            "impacts, or case studies. Never paste the full role prompt or text "
            "like 'You are ...'."
        )
    )

def _build_search_plan(query: str) -> list[str]:
    return build_search_plan(query)


def _sanitize_search_query(query: str) -> str:
    return sanitize_search_query(query)


def _filter_results(topic: str, query: str, results: list[SearchResult]) -> list[SearchResult]:
    return filter_results(topic, query, results)


def _format_evidence_brief(
    topic: str,
    search_plan: list[str],
    grouped_results: list[tuple[str, list[SearchResult]]],
) -> str:
    return format_evidence_brief(topic, search_plan, grouped_results)


async def _execute_search_plan(search_plan: list[str]) -> list[tuple[str, list[SearchResult]]]:
    """Run planned sub-queries in parallel and collect the raw results."""
    settings = get_settings()
    search_factory = get_search_factory()
    per_query_results = min(
        max(settings.search.max_results_per_query, 1),
        _MAX_RESULTS_PER_QUERY,
    )

    searches = [
        search_factory.search(planned_query, num_results=per_query_results)
        for planned_query in search_plan
    ]
    resolved = await asyncio.gather(*searches, return_exceptions=True)

    grouped_results: list[tuple[str, list[SearchResult]]] = []
    for planned_query, result in zip(search_plan, resolved, strict=False):
        if isinstance(result, Exception):
            logger.warning("Search sub-query failed for '%s': %s", planned_query, result)
            grouped_results.append((planned_query, []))
            continue
        grouped_results.append((planned_query, result))

    return grouped_results


@tool("web_search", args_schema=SearchInput)
async def web_search(query: str, **kwargs: Any) -> str:
    """
    Search the web for information using the configured search engine.

    Use this tool for targeted fact checking or for automatic evidence gathering
    from a debate topic.
    """
    sanitized_query = _sanitize_search_query(query)
    if not sanitized_query:
        return (
            "Invalid search query. Search only for concise factual keywords "
            "related to the debate topic, not the full prompt."
        )

    if sanitized_query != query.strip():
        logger.warning(
            "Sanitized malformed search query from '%s' to '%s'",
            query[:200],
            sanitized_query,
        )

    search_plan = _build_search_plan(sanitized_query)
    if not search_plan:
        return (
            "Invalid search query. Please provide a concise fact query or a debate topic "
            "that can be decomposed into factual sub-queries."
        )

    logger.info("Agent requested web search for: '%s' (plan: %s)", sanitized_query, search_plan)
    try:
        raw_grouped_results = await _execute_search_plan(search_plan)
        filtered_grouped_results = [
            (planned_query, _filter_results(sanitized_query, planned_query, results))
            for planned_query, results in raw_grouped_results
        ]

        if not any(results for _, results in filtered_grouped_results):
            return (
                f"Debate Evidence Brief\nTopic: {sanitized_query}\n\n"
                "Evidence:\n"
                "- No high-confidence relevant results were found after planning and filtering.\n\n"
                "Notes:\n"
                "- The query was treated as a debate topic and decomposed into factual sub-queries.\n"
                "- Search results were too weak or off-topic to use confidently.\n"
                "- State uncertainty instead of inventing facts."
            )

        return _format_evidence_brief(
            topic=sanitized_query,
            search_plan=search_plan,
            grouped_results=filtered_grouped_results,
        )

    except Exception as exc:
        logger.error("Error during web search tool execution: %s", exc)
        return f"Search failed due to an error: {exc}. Please rely on internal knowledge."


mark_tool_shared_knowledge(web_search, "fact")
