"""
DDGS search provider — lightweight default search backend.
Uses the ddgs library for web search without API key requirements.
"""

from __future__ import annotations

import asyncio
import logging

from ddgs import DDGS

from app.search.base import SearchProvider, SearchResult

logger = logging.getLogger(__name__)


class DDGSProvider(SearchProvider):
    """
    Queries web search through the ddgs library.
    This provider requires no API key and is always available.
    """

    async def search(self, query: str, num_results: int = 5) -> list[SearchResult]:
        """
        Execute a DDGS search.
        DDGS is synchronous, so we run it in a worker thread.
        """

        def _sync_search() -> list[SearchResult]:
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
                            source_engine="ddgs",
                        )
                    )
            except Exception as exc:
                logger.error("DDGS search failed: %s", exc)
            return results

        try:
            return await asyncio.to_thread(_sync_search)
        except Exception as exc:
            logger.error("DDGS search executor failed: %s", exc)
            return []

    async def is_available(self) -> bool:
        """DDGS is available as long as the bundled library is present."""
        return True

    async def close(self) -> None:
        """Cleanup resources - nothing to close for this provider."""
        pass
