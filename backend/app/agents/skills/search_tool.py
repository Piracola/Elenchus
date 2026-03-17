"""
Unified web search tool for agents.
Uses the SearchProviderFactory to execute searches with automatic provider fallback.
"""

import logging
from typing import Any

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from app.dependencies import get_search_factory

logger = logging.getLogger(__name__)


class SearchInput(BaseModel):
    """Input schema for web search tool."""

    query: str = Field(
        description="The search query to find information on the web. "
        "Use this to fact-check claims, retrieve statistics, or find contextual evidence."
    )


@tool("web_search", args_schema=SearchInput)
async def web_search(query: str, **kwargs: Any) -> str:
    """
    Search the web for information using the configured search engine.
    This tool automatically uses the best available search provider (DuckDuckGo, SearXNG, or Tavily).
    Use this to fact-check claims, retrieve statistics, or find contextual evidence.
    """
    logger.info("Agent requested web search for: '%s'", query)
    try:
        search_factory = get_search_factory()
        results = await search_factory.search(query, num_results=5)
        if not results:
            return "No relevant search results found. Proceed with caution and state this uncertainty."

        formatted = "\n\n".join(
            [
                f"Source: {r.source_engine}\nTitle: {r.title}\nURL: {r.url}\nSummary: {r.snippet}"
                for r in results
            ]
        )
        return f"Search Results for '{query}':\n{formatted}"

    except Exception as exc:
        logger.error("Error during web search tool execution: %s", exc)
        return f"Search failed due to an error: {exc}. Please rely on your internal knowledge."
