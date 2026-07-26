"""
Tests for search provider factory behavior.
"""

from __future__ import annotations

import pytest

from app.search.factory import SearchProviderFactory
from app.search.registry import provider_names


class _AvailableProvider:
    name = "stub"

    async def is_available(self) -> bool:
        return True


class _UnavailableProvider:
    name = "stub"

    async def is_available(self) -> bool:
        return False


@pytest.mark.asyncio
async def test_get_available_providers_reports_every_registered_provider():
    factory = SearchProviderFactory()
    factory._providers = {"ddgs": _AvailableProvider()}
    factory._current_provider = "ddgs"
    factory._initialized = True

    providers = await factory.get_available_providers()
    by_name = {info.name: info for info in providers}

    # The settings UI needs a card per registered provider, configured or not.
    assert set(by_name) == set(provider_names())
    assert by_name["ddgs"].available is True
    assert by_name["ddgs"].is_primary is True
    assert by_name["ddgs"].configured is True
    # Providers that were never instantiated report as unconfigured.
    assert by_name["tavily"].configured is False
    assert by_name["tavily"].available is False


@pytest.mark.asyncio
async def test_get_provider_falls_back_from_custom_to_ddgs():
    factory = SearchProviderFactory()
    factory._providers = {
        "ddgs": _AvailableProvider(),
        "custom": _UnavailableProvider(),
    }
    factory._current_provider = "custom"
    factory._initialized = True

    provider = await factory.get_provider()

    assert provider is factory._providers["ddgs"]


@pytest.mark.asyncio
async def test_fallback_order_starts_with_current_then_registry_priority():
    factory = SearchProviderFactory()
    factory._current_provider = "custom"
    factory._initialized = True

    order = factory._fallback_order()

    assert order[0] == "custom"
    assert set(order) == set(provider_names())
    # ddgs declares the highest fallback_priority, so it is tried last.
    assert order[-1] == "ddgs"


@pytest.mark.asyncio
async def test_search_falls_back_down_the_ordered_list():
    class _FailingProvider:
        name = "custom"

        async def is_available(self) -> bool:
            return True

        async def search(self, query, num_results=5):
            raise RuntimeError("upstream down")

    class _WorkingProvider:
        name = "ddgs"

        async def is_available(self) -> bool:
            return True

        async def search(self, query, num_results=5):
            return ["result"]

    factory = SearchProviderFactory()
    factory._providers = {"custom": _FailingProvider(), "ddgs": _WorkingProvider()}
    factory._current_provider = "custom"
    factory._initialized = True

    assert await factory.search("q") == ["result"]


@pytest.mark.asyncio
async def test_search_returns_empty_when_every_provider_fails():
    class _FailingProvider:
        def __init__(self, name: str) -> None:
            self.name = name

        async def is_available(self) -> bool:
            return True

        async def search(self, query, num_results=5):
            raise RuntimeError("down")

    factory = SearchProviderFactory()
    factory._providers = {"custom": _FailingProvider("custom"), "ddgs": _FailingProvider("ddgs")}
    factory._current_provider = "custom"
    factory._initialized = True

    assert await factory.search("q") == []


def test_set_provider_rejects_unconfigured_provider():
    factory = SearchProviderFactory()
    factory._providers = {"ddgs": _AvailableProvider()}
    factory._current_provider = "ddgs"
    factory._initialized = True

    # tavily is registered but has no API key, so it was never instantiated.
    assert factory.set_provider("tavily") is False
    assert factory.set_provider("nope") is False
    assert factory.get_current_provider() == "ddgs"
