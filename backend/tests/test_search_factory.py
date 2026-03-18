"""
Tests for search provider factory behavior.
"""

from __future__ import annotations

import pytest

from app.search.factory import SearchProviderFactory


class _AvailableProvider:
    async def is_available(self) -> bool:
        return True


@pytest.mark.asyncio
async def test_get_available_providers_uses_instance_state_without_recursion():
    factory = SearchProviderFactory()
    factory._providers = {"duckduckgo": _AvailableProvider()}
    factory._current_provider = "duckduckgo"
    factory._initialized = True

    providers = await factory.get_available_providers()

    assert len(providers) == 1
    assert providers[0].name == "duckduckgo"
    assert providers[0].available is True
    assert providers[0].is_primary is True
