"""Minimal HTTP JSON search provider for user-hosted search bridges."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.search.base import SearchProvider, SearchResult

logger = logging.getLogger(__name__)


class CustomSearchProvider(SearchProvider):
    """Call a user-configured endpoint and normalize common result shapes."""

    def __init__(self, endpoint: str, api_key: str = "") -> None:
        self.endpoint = endpoint.strip()
        self.api_key = api_key.strip()
        self._client = httpx.AsyncClient(timeout=20.0)

    async def search(self, query: str, num_results: int = 5) -> list[SearchResult]:
        if not self.endpoint:
            return []

        headers = {}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        payload = {"query": query, "q": query, "num_results": num_results, "limit": num_results}
        try:
            response = await self._client.post(self.endpoint, json=payload, headers=headers)
            if response.status_code == 405:
                response = await self._client.get(self.endpoint, params=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            logger.error("Custom search failed: %s", exc)
            return []

        return _normalize_custom_results(data, num_results=num_results)

    async def is_available(self) -> bool:
        return bool(self.endpoint)

    async def close(self) -> None:
        await self._client.aclose()


def _candidate_items(data: Any) -> list[Any]:
    if isinstance(data, list):
        return data
    if not isinstance(data, dict):
        return []
    for key in ("results", "items", "data"):
        value = data.get(key)
        if isinstance(value, list):
            return value
    return []


def _first_text(item: dict[str, Any], keys: tuple[str, ...]) -> str:
    for key in keys:
        value = item.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _normalize_custom_results(data: Any, *, num_results: int) -> list[SearchResult]:
    results: list[SearchResult] = []
    for item in _candidate_items(data):
        if not isinstance(item, dict):
            continue
        results.append(
            SearchResult(
                title=_first_text(item, ("title", "name", "heading")),
                url=_first_text(item, ("url", "href", "link")),
                snippet=_first_text(item, ("snippet", "content", "description", "text")),
                source_engine="custom",
            )
        )
        if len(results) >= num_results:
            break
    return results
