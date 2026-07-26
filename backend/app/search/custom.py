"""Minimal HTTP JSON search provider for user-hosted search bridges."""

from __future__ import annotations

import logging
from typing import Any, ClassVar

import httpx

from app.search.base import ProviderFieldSpec, SearchProvider, SearchResult
from app.search.http_client import new_client
from app.search.registry import register_search_provider

logger = logging.getLogger(__name__)


@register_search_provider
class CustomSearchProvider(SearchProvider):
    """Call a user-configured endpoint and normalize common result shapes."""

    name: ClassVar[str] = "custom"
    label: ClassVar[str] = "自定义接口"
    description: ClassVar[str] = "把任意 HTTP JSON 搜索服务接进来，后端会自动适配常见的结果字段命名。"
    fallback_priority: ClassVar[int] = 500
    config_fields: ClassVar[tuple[ProviderFieldSpec, ...]] = (
        ProviderFieldSpec(
            key="endpoint",
            label="Endpoint",
            placeholder="https://search.example.com/query",
            helper_text="后端会优先 POST JSON，若接口返回 405 则改用 GET 查询参数。",
            required=True,
        ),
        ProviderFieldSpec(
            key="api_key",
            label="API Key",
            type="password",
            placeholder="可选，留空表示保持已保存的 Key",
            helper_text="若填写，将以 Authorization: Bearer 头发送。",
            secret=True,
        ),
    )

    def __init__(self, endpoint: str = "", api_key: str = "") -> None:
        self.endpoint = endpoint.strip()
        self.api_key = api_key.strip()
        self._client = new_client()

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
                source_engine=CustomSearchProvider.name,
            )
        )
        if len(results) >= num_results:
            break
    return results
