"""
Tests for search provider factory behavior.
"""

from __future__ import annotations

import pytest

from app.search.factory import SearchProviderFactory


class _AvailableProvider:
    async def is_available(self) -> bool:
        return True


class _UnavailableProvider:
    async def is_available(self) -> bool:
        return False


@pytest.mark.asyncio
async def test_get_available_providers_uses_instance_state_without_recursion():
    factory = SearchProviderFactory()
    factory._providers = {"ddgs": _AvailableProvider()}
    factory._current_provider = "ddgs"
    factory._initialized = True

    providers = await factory.get_available_providers()

    assert len(providers) == 1
    assert providers[0].name == "ddgs"
    assert providers[0].available is True
    assert providers[0].is_primary is True


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
