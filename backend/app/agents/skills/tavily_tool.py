import logging
from typing import Any

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from app.search.factory import SearchProviderFactory

logger = logging.getLogger(__name__)


class TavilyInput(BaseModel):
    query: str = Field(description="The primary search query to investigate facts online using Tavily API.")


@tool("search_tavily", args_schema=TavilyInput)
async def search_tavily(query: str, **kwargs: Any) -> str:
    """
    Search the web using the Tavily Deep Search API.
    Use this fallback tool to fact-check claims if the primary SearXNG tool fails or you need deeper search results.
    """
    logger.info(f"Agent requested Tavily search for: '{query}'")
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
        logger.error(f"Error during Tavily web search tool execution: {exc}")
        return f"Search failed due to an error: {str(exc)}. Please rely on your internal knowledge."
