"""
SearXNG search provider — primary search backend.
Connects to a locally deployed SearXNG instance via its JSON API.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.search.base import SearchProvider, SearchResult

logger = logging.getLogger(__name__)


class SearXNGProvider(SearchProvider):
    """
    Queries a self-hosted SearXNG meta-search engine.
    Expects the instance to have JSON output enabled in settings.yml.
    """

    def __init__(self, base_url: str = "http://localhost:8080", api_key: str | None = None):
        self.base_url = base_url.rstrip("/")
        self.api_key = (api_key or "").strip()
        self._client = httpx.AsyncClient(timeout=15.0)

    def _auth_headers(self) -> dict[str, str]:
        if not self.api_key:
            return {}
        return {
            "Authorization": f"Bearer {self.api_key}",
            "X-API-Key": self.api_key,
        }

    async def search(self, query: str, num_results: int = 5) -> list[SearchResult]:
        """
        Call SearXNG's /search endpoint with format=json.
        """
        params: dict[str, Any] = {
            "q": query,
            "format": "json",
            "language": "auto",
            "safesearch": 0,
        }
        try:
            resp = await self._client.get(
                f"{self.base_url}/search",
                params=params,
                headers=self._auth_headers(),
            )
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPError as exc:
            logger.error("SearXNG search failed: %s", exc)
            return []

        results: list[SearchResult] = []
        for item in data.get("results", [])[:num_results]:
            results.append(
                SearchResult(
                    title=item.get("title", ""),
                    url=item.get("url", ""),
                    snippet=item.get("content", ""),
                    source_engine=item.get("engine", "searxng"),
                )
            )
        return results

    async def is_available(self) -> bool:
        """Check if SearXNG instance is reachable with short timeout."""
        try:
            resp = await self._client.get(
                f"{self.base_url}/healthz",
                timeout=httpx.Timeout(0.8, connect=0.3),
                headers=self._auth_headers(),
            )
            return resp.status_code == 200
        except Exception:
            return False

    async def close(self):
        await self._client.aclose()
