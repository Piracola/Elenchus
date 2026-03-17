"""Service layer — business logic between API routes and data stores."""

from app.services.intervention_manager import InterventionManager

# Re-export dependency injection functions for convenience
from app.dependencies import (
    get_provider_service,
    get_llm_router,
    get_search_factory,
    get_intervention_manager,
    clear_dependency_cache,
)

get_intervention_manager_dep = get_intervention_manager

__all__ = [
    "InterventionManager",
    "get_intervention_manager",
    # Dependency injection functions
    "get_provider_service",
    "get_llm_router",
    "get_search_factory",
    "get_intervention_manager_dep",
    "clear_dependency_cache",
]
