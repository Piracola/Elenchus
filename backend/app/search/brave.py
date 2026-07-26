"""Brave Search provider — independent web index."""

from __future__ import annotations

from typing import ClassVar

from app.search.base import ProviderFieldSpec, SearchProvider, SearchResult
from app.search.http_client import dig_items, first_text, get_json, new_client
from app.search.registry import register_search_provider

_API_URL = "https://api.search.brave.com/res/v1/web/search"
_MAX_COUNT = 20


@register_search_provider
class BraveProvider(SearchProvider):
    """Query the Brave Search API."""

    name: ClassVar[str] = "brave"
    label: ClassVar[str] = "Brave Search"
    description: ClassVar[str] = "独立索引的通用网页搜索 API，覆盖面广，适合查证具体事实与新闻。"
    fallback_priority: ClassVar[int] = 20
    config_fields: ClassVar[tuple[ProviderFieldSpec, ...]] = (
        ProviderFieldSpec(
            key="api_key",
            label="API Key",
            type="password",
            placeholder="BSA...",
            helper_text="在 Brave Search API 控制台创建。留空表示保持已保存的 Key。",
            secret=True,
            required=True,
        ),
    )

    def __init__(self, api_key: str = "") -> None:
        self.api_key = api_key.strip()
        self._client = new_client()

    async def search(self, query: str, num_results: int = 5) -> list[SearchResult]:
        if not self.api_key:
            return []

        data = await get_json(
            self._client,
            _API_URL,
            provider=self.name,
            params={"q": query, "count": max(1, min(num_results, _MAX_COUNT))},
            headers={
                "Accept": "application/json",
                "X-Subscription-Token": self.api_key,
            },
        )
        if data is None:
            return []

        results: list[SearchResult] = []
        for item in dig_items(data, ("web", "results"))[:num_results]:
            if not isinstance(item, dict):
                continue
            results.append(
                SearchResult(
                    title=first_text(item, ("title",)),
                    url=first_text(item, ("url",)),
                    snippet=first_text(item, ("description", "snippet")),
                    source_engine=self.name,
                )
            )
        return results

    async def is_available(self) -> bool:
        return bool(self.api_key)

    async def close(self) -> None:
        await self._client.aclose()
