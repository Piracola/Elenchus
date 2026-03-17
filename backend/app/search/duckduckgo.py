"""
DuckDuckGo search provider — default search backend.
Uses duckduckgo-search library for web search without API key requirements.
"""

from __future__ import annotations

import asyncio
import logging

from ddgs import DDGS

from app.search.base import SearchProvider, SearchResult

logger = logging.getLogger(__name__)


class DuckDuckGoProvider(SearchProvider):
    """
    Queries DuckDuckGo search engine using the duckduckgo-search library.
    This provider requires no API key and is always available.
    """

    def __init__(self) -> None:
        pass

    async def search(self, query: str, num_results: int = 5) -> list[SearchResult]:
        """
        Execute a DuckDuckGo search.
        DDGS is synchronous, so we run it in a thread using asyncio.to_thread().
        """

        def _sync_search() -> list[SearchResult]:
            """Synchronous search operation to be run in thread."""
            results: list[SearchResult] = []
            try:
                with DDGS() as ddgs:
                    search_results = list(ddgs.text(query, max_results=num_results))

                for item in search_results:
                    results.append(
                        SearchResult(
                            title=item.get("title", ""),
                            url=item.get("href", ""),
                            snippet=item.get("body", ""),
                            source_engine="duckduckgo",
                        )
                    )
            except Exception as exc:
                logger.error("DuckDuckGo search failed: %s", exc)
            return results

        try:
            return await asyncio.to_thread(_sync_search)
        except Exception as exc:
            logger.error("DuckDuckGo search executor failed: %s", exc)
            return []

    async def is_available(self) -> bool:
        """DuckDuckGo is always available (no API key required)."""
        return True

    async def close(self) -> None:
        """Cleanup resources - nothing to close for this provider."""
        pass
