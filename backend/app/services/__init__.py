"""Service layer — business logic between API routes and data stores."""

from app.services.intervention_manager import InterventionManager
from app.services.agent_config_service import AgentConfigService
from app.services.connection_hub import ConnectionHub

# Re-export dependency injection functions for convenience
from app.dependencies import (
    get_agent_config_service,
    get_connection_hub,
    get_runtime_bus,
    get_provider_service,
    get_llm_router,
    get_search_factory,
    get_intervention_manager,
    clear_dependency_cache,
)

get_intervention_manager_dep = get_intervention_manager

__all__ = [
    "InterventionManager",
    "AgentConfigService",
    "ConnectionHub",
    "get_intervention_manager",
    "get_agent_config_service",
    "get_runtime_bus",
    "get_connection_hub",
    # Dependency injection functions
    "get_provider_service",
    "get_llm_router",
    "get_search_factory",
    "get_intervention_manager_dep",
    "clear_dependency_cache",
]
