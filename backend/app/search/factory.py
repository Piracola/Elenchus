"""
Search provider factory — creates the appropriate provider based on config,
with automatic fallback when the primary provider is unavailable.
"""

from __future__ import annotations

import logging

from app.config import get_settings
from app.search.base import SearchProvider, SearchResult
from app.search.searxng import SearXNGProvider
from app.search.tavily import TavilyProvider

logger = logging.getLogger(__name__)


class SearchProviderFactory:
    """
    Creates and manages search provider instances.
    Supports automatic failover: SearXNG → Tavily → None (skip).
    """

    _primary: SearchProvider | None = None
    _fallback: SearchProvider | None = None

    @classmethod
    def _init_providers(cls) -> None:
        """Lazily initialise provider instances from config."""
        if cls._primary is not None:
            return

        settings = get_settings()

        # Always create SearXNG provider
        searxng = SearXNGProvider(base_url=settings.env.searxng_base_url)

        # Create Tavily provider if API key is available
        tavily: TavilyProvider | None = None
        if settings.env.tavily_api_key:
            tavily = TavilyProvider(api_key=settings.env.tavily_api_key)

        # Assign primary / fallback based on config
        if settings.search.provider == "tavily" and tavily:
            cls._primary = tavily
            cls._fallback = searxng
        else:
            cls._primary = searxng
            cls._fallback = tavily

    @classmethod
    async def get_provider(cls) -> SearchProvider | None:
        """
        Return the best available search provider.
        Checks primary availability first, then falls back.
        Returns None if all providers are unavailable.
        """
        cls._init_providers()

        # Try primary
        if cls._primary and await cls._primary.is_available():
            return cls._primary

        logger.warning(
            "Primary search provider unavailable, trying fallback..."
        )

        # Try fallback
        if cls._fallback and await cls._fallback.is_available():
            logger.info("Using fallback search provider.")
            return cls._fallback

        logger.error("All search providers unavailable.")
        return None

    @classmethod
    async def search(
        cls, query: str, num_results: int = 5
    ) -> list[SearchResult]:
        """
        Convenience method: search using the best available provider.
        Returns empty list if no provider is available.
        """
        provider = await cls.get_provider()
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

            # Try fallback on error
            cls._init_providers()
            fallback = (
                cls._fallback if provider is cls._primary else cls._primary
            )
            if fallback:
                try:
                    return await fallback.search(query, num_results=num_results)
                except Exception as fallback_exc:
                    logger.error(
                        "Fallback search also failed: %s", fallback_exc
                    )

            return []

    @classmethod
    async def close(cls) -> None:
        """Cleanup provider resources."""
        for provider in (cls._primary, cls._fallback):
            if provider and hasattr(provider, "close"):
                await provider.close()
        cls._primary = None
        cls._fallback = None
