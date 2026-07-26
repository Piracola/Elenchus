"""Exa search provider — embeddings-based retrieval."""

from __future__ import annotations

from typing import Any, ClassVar

from app.search.base import ProviderFieldSpec, SearchProvider, SearchResult
from app.search.http_client import dig_items, first_text, new_client, post_json
from app.search.registry import register_search_provider

_API_URL = "https://api.exa.ai/search"
_SNIPPET_CHARS = 600


@register_search_provider
class ExaProvider(SearchProvider):
    """Query the Exa Search API."""

    name: ClassVar[str] = "exa"
    label: ClassVar[str] = "Exa"
    description: ClassVar[str] = "语义检索 API，按含义而非关键词匹配，适合找论证与研究材料。"
    fallback_priority: ClassVar[int] = 30
    config_fields: ClassVar[tuple[ProviderFieldSpec, ...]] = (
        ProviderFieldSpec(
            key="api_key",
            label="API Key",
            type="password",
            placeholder="留空表示保持已保存的 Key",
            helper_text="在 exa.ai 控制台创建。",
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
            headers={"x-api-key": self.api_key},
            json={
                "query": query,
                "numResults": num_results,
                "contents": {"text": {"maxCharacters": _SNIPPET_CHARS}},
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
                    snippet=_snippet_of(item),
                    source_engine=self.name,
                )
            )
        return results

    async def is_available(self) -> bool:
        return bool(self.api_key)

    async def close(self) -> None:
        await self._client.aclose()


def _snippet_of(item: dict[str, Any]) -> str:
    """Exa returns full text; keep the leading chunk as the snippet."""
    text = first_text(item, ("text", "snippet", "summary"))
    return text[:_SNIPPET_CHARS]
