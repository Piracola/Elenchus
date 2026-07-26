"""Service layer — business logic between API routes and data stores."""

# Re-export dependency injection functions for convenience
from app.dependencies import (
    clear_dependency_cache,
    get_agent_config_service,
    get_llm_router,
    get_provider_service,
    get_runtime_bus,
    get_search_factory,
)
from app.services.agent_config_service import AgentConfigService
from app.services.export import export_json, export_markdown

# Subpackage facades
from app.services.provider.service import ProviderService

__all__ = [
    "AgentConfigService",
    "ProviderService",
    "export_json",
    "export_markdown",
    "get_agent_config_service",
    "get_runtime_bus",
    # Dependency injection functions
    "get_provider_service",
    "get_llm_router",
    "get_search_factory",
    "clear_dependency_cache",
]
