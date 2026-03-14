import logging
from typing import Any

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from app.search.factory import SearchProviderFactory

logger = logging.getLogger(__name__)


class SearXNGInput(BaseModel):
    query: str = Field(description="The primary search query to investigate facts online using SearXNG.")


@tool("search_searxng", args_schema=SearXNGInput)
async def search_searxng(query: str, **kwargs: Any) -> str:
    """
    Search the web using the SearXNG meta-search engine.
    Use this primary tool to fact-check claims, retrieve statistics, or find contextual evidence.
    """
    logger.info(f"Agent requested SearXNG search for: '{query}'")
    try:
        results = await SearchProviderFactory.search(query, num_results=3)
        if not results:
            return "No relevant search results found. Proceed with caution and state this uncertainty."

        formatted = "\n\n".join([
            f"Source: {r.source_engine}\nTitle: {r.title}\nURL: {r.url}\nSummary: {r.snippet}"
            for r in results
        ])
        return f"Search Results for '{query}':\n{formatted}"

    except Exception as exc:
        logger.error(f"Error during web search tool execution: {exc}")
        return f"Search failed due to an error: {str(exc)}. Please rely on your internal knowledge."
