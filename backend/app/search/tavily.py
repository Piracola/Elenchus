"""
Tavily search provider — optional fallback when SearXNG is unavailable.
Requires a TAVILY_API_KEY in .env.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.search.base import SearchProvider, SearchResult

logger = logging.getLogger(__name__)

_TAVILY_API_URL = "https://api.tavily.com/search"


class TavilyProvider(SearchProvider):
    """
    Queries the Tavily Deep Search API as a fallback search backend.
    """

    def __init__(self, api_key: str, api_url: str = _TAVILY_API_URL):
        self.api_key = api_key
        self.api_url = (api_url or "").strip() or _TAVILY_API_URL
        self._client = httpx.AsyncClient(timeout=20.0)

    async def search(self, query: str, num_results: int = 5) -> list[SearchResult]:
        payload: dict[str, Any] = {
            "api_key": self.api_key,
            "query": query,
            "max_results": num_results,
            "search_depth": "basic",
            "include_answer": False,
        }
        try:
            resp = await self._client.post(self.api_url, json=payload)
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPError as exc:
            logger.error("Tavily search failed: %s", exc)
            return []

        results: list[SearchResult] = []
        for item in data.get("results", [])[:num_results]:
            results.append(
                SearchResult(
                    title=item.get("title", ""),
                    url=item.get("url", ""),
                    snippet=item.get("content", ""),
                    source_engine="tavily",
                )
            )
        return results

    async def is_available(self) -> bool:
        return bool(self.api_key)

    async def close(self):
        await self._client.aclose()
