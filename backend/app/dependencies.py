"""
Dependency injection container for FastAPI.

This module provides singleton instances via FastAPI's Depends mechanism,
replacing global module-level singletons for better testability and
multi-tenancy support.

Usage in API routes:
    from fastapi import Depends
    from app.dependencies import get_provider_service

    @router.get("/")
    async def list_models(service: ProviderService = Depends(get_provider_service)):
        return await service.list_configs()

Usage in services (non-FastAPI context):
    from app.dependencies import get_provider_service
    service = get_provider_service()
"""

from __future__ import annotations

from functools import lru_cache
from typing import TYPE_CHECKING

# Use TYPE_CHECKING to avoid circular imports at runtime
if TYPE_CHECKING:
    from app.agents.llm_router import LLMRouter
    from app.search.factory import SearchProviderFactory
    from app.services.provider_service import ProviderService
    from app.services.intervention_manager import InterventionManager


@lru_cache()
def get_provider_service() -> "ProviderService":
    """
    Get the singleton ProviderService instance.

    Uses lru_cache to ensure only one instance exists per process.
    Thread-safe due to Python's GIL during module import.
    """
    from app.services.provider_service import ProviderService
    return ProviderService()


@lru_cache()
def get_llm_router() -> "LLMRouter":
    """
    Get the singleton LLMRouter instance.

    The router maintains a registry of provider clients for LLM calls.
    """
    from app.agents.llm_router import LLMRouter
    return LLMRouter()


@lru_cache()
def get_search_factory() -> "SearchProviderFactory":
    """
    Get the singleton SearchProviderFactory instance.

    The factory manages search provider instances and handles failover.
    """
    from app.search.factory import SearchProviderFactory
    return SearchProviderFactory()


@lru_cache()
def get_intervention_manager() -> "InterventionManager":
    """
    Get the singleton InterventionManager instance.

    Manages pending user interventions for debate sessions.
    """
    from app.services.intervention_manager import InterventionManager
    return InterventionManager()


def clear_dependency_cache() -> None:
    """
    Clear all cached singleton instances.

    Useful for testing to reset state between test cases.
    Call this in test fixtures or when you need fresh instances.
    """
    get_provider_service.cache_clear()
    get_llm_router.cache_clear()
    get_search_factory.cache_clear()
    get_intervention_manager.cache_clear()
