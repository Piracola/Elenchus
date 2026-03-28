from __future__ import annotations

from typing import Any

from app.runtime_config_store import load_runtime_config, update_runtime_config

from app.services.provider_serializers import sort_provider_configs


class ProviderConfigStore:
    def load_provider_configs(self) -> list[dict[str, Any]]:
        config = load_runtime_config()
        providers = config.get("providers")
        if not isinstance(providers, list):
            return []
        return sort_provider_configs(
            [dict(provider) for provider in providers if isinstance(provider, dict)]
        )

    def update_provider_configs(self, mutator):
        return update_runtime_config(mutator)
