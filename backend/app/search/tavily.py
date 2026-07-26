"""Tavily search provider — retrieval API built for LLM agents."""

from __future__ import annotations

from typing import ClassVar

from app.search.base import ProviderFieldSpec, SearchProvider, SearchResult
from app.search.http_client import dig_items, first_text, new_client, post_json
from app.search.registry import register_search_provider

_API_URL = "https://api.tavily.com/search"


@register_search_provider
class TavilyProvider(SearchProvider):
    """Query the Tavily Search API."""

    name: ClassVar[str] = "tavily"
    label: ClassVar[str] = "Tavily"
    description: ClassVar[str] = "面向 AI 检索的搜索 API，返回已清理的正文摘要，适合作为辩论证据来源。"
    fallback_priority: ClassVar[int] = 10
    config_fields: ClassVar[tuple[ProviderFieldSpec, ...]] = (
        ProviderFieldSpec(
            key="api_key",
            label="API Key",
            type="password",
            placeholder="tvly-...",
            helper_text="在 tavily.com 控制台创建。留空表示保持已保存的 Key。",
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

        data = await post_json(
            self._client,
            _API_URL,
            provider=self.name,
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={
                "query": query,
                "max_results": num_results,
                "search_depth": "basic",
                "include_answer": False,
            },
        )
        if data is None:
            return []

        results: list[SearchResult] = []
        for item in dig_items(data, ("results",))[:num_results]:
            if not isinstance(item, dict):
                continue
            results.append(
                SearchResult(
                    title=first_text(item, ("title",)),
                    url=first_text(item, ("url",)),
                    snippet=first_text(item, ("content", "raw_content")),
                    source_engine=self.name,
                )
            )
        return results

    async def is_available(self) -> bool:
        return bool(self.api_key)

    async def close(self) -> None:
        await self._client.aclose()
