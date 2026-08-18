"""Per-provider request construction and response parsing."""

from __future__ import annotations

import httpx
import pytest

from app.search.brave import BraveProvider
from app.search.exa import ExaProvider
from app.search.registry import (
    default_provider_name,
    get_provider_class,
    provider_names,
)
from app.search.tavily import TavilyProvider


class _RecordingClient:
    """Stands in for httpx.AsyncClient, capturing one request."""

    def __init__(self, payload: object, status_code: int = 200) -> None:
        self.payload = payload
        self.status_code = status_code
        self.calls: list[dict] = []
        self.is_closed = False

    async def post(self, url, json=None, headers=None):
        self.calls.append({"method": "POST", "url": url, "json": json, "headers": headers})
        return self._response()

    async def get(self, url, params=None, headers=None):
        self.calls.append({"method": "GET", "url": url, "params": params, "headers": headers})
        return self._response()

    def _response(self):
        request = httpx.Request("POST", "https://example.test")
        return httpx.Response(self.status_code, json=self.payload, request=request)

    async def aclose(self) -> None:
        self.is_closed = True


def _with_client(provider, payload, status_code: int = 200) -> _RecordingClient:
    client = _RecordingClient(payload, status_code)
    provider._client = client
    return client


# ── registry ────────────────────────────────────────────────────


def test_registry_exposes_every_provider_with_metadata():
    names = provider_names()
    assert {"ddgs", "tavily", "brave", "exa", "custom"} <= set(names)
    for name in names:
        provider_class = get_provider_class(name)
        assert provider_class is not None
        assert provider_class.label, f"{name} must declare a label"
        assert provider_class.description, f"{name} must declare a description"


def test_offline_provider_is_the_default_and_tried_last():
    # The provider that needs no configuration must be the safety net.
    assert default_provider_name() == "ddgs"
    assert provider_names()[-1] == "ddgs"


def test_every_api_key_field_is_declared_secret_and_required():
    for name in ("tavily", "brave", "exa"):
        provider_class = get_provider_class(name)
        assert provider_class is not None
        api_key = next(f for f in provider_class.config_fields if f.key == "api_key")
        assert api_key.secret is True
        assert api_key.required is True
        assert api_key.type == "password"


def test_is_configured_requires_all_required_fields():
    tavily = get_provider_class("tavily")
    custom = get_provider_class("custom")
    assert tavily is not None and custom is not None

    assert tavily.is_configured({"api_key": "k"}) is True
    assert tavily.is_configured({"api_key": "   "}) is False
    assert tavily.is_configured({}) is False
    # endpoint is required for custom; api_key is optional.
    assert custom.is_configured({"endpoint": "https://x.test"}) is True
    assert custom.is_configured({"api_key": "k"}) is False
    # ddgs needs nothing at all.
    ddgs = get_provider_class("ddgs")
    assert ddgs is not None and ddgs.is_configured({}) is True


def test_create_builds_instance_from_declared_fields():
    provider = get_provider_class("custom").create(
        {"endpoint": "  https://x.test  ", "api_key": " k "}
    )
    assert provider.endpoint == "https://x.test"
    assert provider.api_key == "k"


# ── Tavily ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_tavily_sends_bearer_auth_and_parses_results():
    provider = TavilyProvider(api_key="tvly-123")
    client = _with_client(
        provider,
        {
            "results": [
                {"title": "T1", "url": "https://a.test", "content": "C1"},
                {"title": "T2", "url": "https://b.test", "raw_content": "C2"},
            ]
        },
    )

    results = await provider.search("全民基本收入", num_results=2)

    call = client.calls[0]
    assert call["method"] == "POST"
    assert call["headers"]["Authorization"] == "Bearer tvly-123"
    assert call["json"]["query"] == "全民基本收入"
    assert call["json"]["max_results"] == 2
    assert [r.title for r in results] == ["T1", "T2"]
    assert [r.snippet for r in results] == ["C1", "C2"]
    assert {r.source_engine for r in results} == {"tavily"}


@pytest.mark.asyncio
async def test_tavily_returns_empty_on_http_error():
    provider = TavilyProvider(api_key="tvly-123")
    _with_client(provider, {"detail": "unauthorized"}, status_code=401)

    assert await provider.search("q") == []


@pytest.mark.asyncio
async def test_tavily_skips_the_call_without_a_key():
    provider = TavilyProvider()
    client = _with_client(provider, {"results": []})

    assert await provider.search("q") == []
    assert client.calls == []
    assert await provider.is_available() is False


# ── Brave ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_brave_uses_subscription_header_and_nested_results():
    provider = BraveProvider(api_key="BSA-123")
    client = _with_client(
        provider,
        {"web": {"results": [{"title": "B1", "url": "https://a.test", "description": "D1"}]}},
    )

    results = await provider.search("carbon emissions", num_results=3)

    call = client.calls[0]
    assert call["method"] == "GET"
    assert call["headers"]["X-Subscription-Token"] == "BSA-123"
    assert call["params"] == {"q": "carbon emissions", "count": 3}
    assert results[0].snippet == "D1"
    assert results[0].source_engine == "brave"


@pytest.mark.asyncio
async def test_brave_clamps_count_to_api_maximum():
    provider = BraveProvider(api_key="BSA-123")
    client = _with_client(provider, {"web": {"results": []}})

    await provider.search("q", num_results=500)

    assert client.calls[0]["params"]["count"] == 20


# ── Exa ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_exa_uses_api_key_header_and_truncates_text():
    provider = ExaProvider(api_key="exa-123")
    client = _with_client(
        provider,
        {"results": [{"title": "E1", "url": "https://a.test", "text": "x" * 2000}]},
    )

    results = await provider.search("semantic query", num_results=1)

    call = client.calls[0]
    assert call["headers"]["x-api-key"] == "exa-123"
    assert call["json"]["numResults"] == 1
    assert len(results[0].snippet) == 600
    assert results[0].source_engine == "exa"


@pytest.mark.asyncio
async def test_providers_ignore_malformed_result_entries():
    provider = TavilyProvider(api_key="k")
    _with_client(provider, {"results": ["not-a-dict", {"title": "ok", "url": "u"}]})

    results = await provider.search("q")

    assert [r.title for r in results] == ["ok"]


@pytest.mark.asyncio
async def test_close_releases_the_http_client():
    provider = ExaProvider(api_key="k")
    client = _with_client(provider, {"results": []})

    await provider.close()

    assert client.is_closed is True
