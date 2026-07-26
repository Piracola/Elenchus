"""Service layer — business logic between API routes and data stores."""

from app.services.agent_config_service import AgentConfigService

# Subpackage facades
from app.services.provider.service import ProviderService
from app.services.export import export_json, export_markdown

# Re-export dependency injection functions for convenience
from app.dependencies import (
    get_agent_config_service,
    get_runtime_bus,
    get_provider_service,
    get_llm_router,
    get_search_factory,
    clear_dependency_cache,
)

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
