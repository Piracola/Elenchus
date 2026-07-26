"""
DDGS search provider — lightweight default search backend.
Uses the ddgs library for web search without API key requirements.
"""

from __future__ import annotations

import asyncio
import logging
from typing import ClassVar

from ddgs import DDGS

from app.search.base import SearchProvider, SearchResult
from app.search.registry import register_search_provider

logger = logging.getLogger(__name__)


@register_search_provider
class DDGSProvider(SearchProvider):
    """
    Queries web search through the ddgs library.
    This provider requires no API key and is always available.
    """

    name: ClassVar[str] = "ddgs"
    label: ClassVar[str] = "DDGS"
    description: ClassVar[str] = "内置的轻量聚合搜索，无需 API Key，随产物分发，作为最终兜底。"
    # Tried last: a configured API provider is always preferred over it.
    fallback_priority: ClassVar[int] = 900

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
        return None
