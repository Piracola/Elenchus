"""
Search provider factory — creates the appropriate provider based on config,
with automatic fallback when the primary provider is unavailable.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Literal

from app.config import get_settings
from app.search.base import SearchProvider, SearchResult
from app.search.duckduckgo import DuckDuckGoProvider
from app.search.searxng import SearXNGProvider
from app.search.tavily import TavilyProvider

logger = logging.getLogger(__name__)

ProviderType = Literal["duckduckgo", "searxng", "tavily"]


class ProviderInfo:
    """Information about a search provider's status."""

    def __init__(self, name: str, available: bool, is_primary: bool = False):
        self.name = name
        self.available = available
        self.is_primary = is_primary

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "available": self.available,
            "is_primary": self.is_primary,
        }


class SearchProviderFactory:
    """
    Creates and manages search provider instances.
    Supports automatic failover: User Choice -> DuckDuckGo -> SearXNG -> Tavily.
    DuckDuckGo is the default provider as it requires no API key.
    """

    def __init__(self) -> None:
        """Initialize the factory with empty provider registry."""
        self._providers: dict[str, SearchProvider] = {}
        self._current_provider: str = "duckduckgo"
        self._initialized: bool = False

    def _init_providers(self) -> None:
        """Lazily initialise all provider instances from config."""
        if self._initialized:
            return

        settings = get_settings()

        # Always create DuckDuckGo provider (no config required)
        self._providers["duckduckgo"] = DuckDuckGoProvider()

        # Create SearXNG provider
        self._providers["searxng"] = SearXNGProvider(
            base_url=settings.env.searxng_base_url
        )

        # Create Tavily provider if API key is available
        if settings.env.tavily_api_key:
            self._providers["tavily"] = TavilyProvider(api_key=settings.env.tavily_api_key)

        # Set initial provider from config (default to duckduckgo)
        config_provider = settings.search.provider
        if config_provider in self._providers:
            self._current_provider = config_provider
        else:
            logger.warning(
                "Configured provider '%s' not available, using duckduckgo",
                config_provider,
            )
            self._current_provider = "duckduckgo"

        self._initialized = True
        logger.info("Search providers initialized. Current: %s", self._current_provider)

    def get_current_provider(self) -> str:
        """
        Get the name of the current search provider.

        Returns:
            Name of the current provider.
        """
        self._init_providers()
        return self._current_provider

    def set_provider(self, provider: ProviderType) -> bool:
        """
        Set the current search provider at runtime.

        Args:
            provider: The provider to use ("duckduckgo", "searxng", or "tavily")

        Returns:
            True if provider was set successfully, False if provider not available.
        """
        self._init_providers()

        if provider not in self._providers:
            logger.warning("Attempted to set unknown provider: %s", provider)
            return False

        self._current_provider = provider
        logger.info("Search provider switched to: %s", provider)
        return True

    async def get_available_providers(self) -> list[ProviderInfo]:
        """
        Get status of all search providers in parallel for fast response.

        Returns:
            List of ProviderInfo objects with availability status.
        """
        self._init_providers()

        async def check_provider(name: str, provider: SearchProvider) -> tuple[str, bool]:
            try:
                available = await asyncio.wait_for(
                    provider.is_available(),
                    timeout=1.0
                )
                return name, available
            except asyncio.TimeoutError:
                logger.warning("Provider %s availability check timed out", name)
                return name, False
            except Exception as exc:
                logger.warning("Provider %s availability check failed: %s", name, exc)
                return name, False

        tasks = [
            check_provider(name, provider)
            for name, provider in self._providers.items()
        ]

        results = await asyncio.gather(*tasks)
        availability_map = dict(results)

        providers_info: list[ProviderInfo] = []
        for name in self._providers:
            providers_info.append(
                ProviderInfo(
                    name=name,
                    available=availability_map.get(name, False),
                    is_primary=(name == self._current_provider),
                )
            )

        return providers_info

    async def get_provider(self) -> SearchProvider | None:
        """
        Return the best available search provider.
        Checks current provider availability first, then falls back in order:
        DuckDuckGo -> SearXNG -> Tavily.
        Returns None if all providers are unavailable.
        """
        self._init_providers()

        # Define fallback order
        fallback_order = ["duckduckgo", "searxng", "tavily"]

        # Put current provider first
        if self._current_provider in fallback_order:
            fallback_order.remove(self._current_provider)
            fallback_order.insert(0, self._current_provider)

        for provider_name in fallback_order:
            if provider_name not in self._providers:
                continue

            provider = self._providers[provider_name]
            try:
                if await provider.is_available():
                    if provider_name != self._current_provider:
                        logger.info(
                            "Using fallback search provider: %s", provider_name
                        )
                    return provider
            except Exception as exc:
                logger.warning("Provider %s availability check failed: %s", provider_name, exc)
                continue

        logger.error("All search providers unavailable.")
        return None

    async def search(
        self, query: str, num_results: int = 5
    ) -> list[SearchResult]:
        """
        Convenience method: search using the best available provider.
        Returns empty list if no provider is available.
        """
        provider = await self.get_provider()
        if provider is None:
            logger.warning(
                "No search provider available — skipping search for: %s",
                query,
            )
            return []

        try:
            return await provider.search(query, num_results=num_results)
        except Exception as exc:
            logger.error("Search failed with provider: %s", exc)

            # Try fallback providers
            self._init_providers()
            for name, fallback in self._providers.items():
                if fallback is provider:
                    continue
                try:
                    logger.info("Trying fallback provider: %s", name)
                    return await fallback.search(query, num_results=num_results)
                except Exception as fallback_exc:
                    logger.error(
                        "Fallback search with %s also failed: %s", name, fallback_exc
                    )

            return []

    async def close(self) -> None:
        """Cleanup provider resources."""
        for name, provider in self._providers.items():
            if hasattr(provider, "close"):
                try:
                    await provider.close()
                except Exception as exc:
                    logger.warning("Error closing provider %s: %s", name, exc)
        self._providers = {}
        self._initialized = False
