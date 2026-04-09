"""
Provider configuration service backed by runtime/config.json.
"""

from __future__ import annotations

import uuid
from typing import Any

from app.models.schemas import ModelConfigCreate, ModelConfigResponse, ModelConfigUpdate
from app.services.provider.config_store import ProviderConfigStore
from app.services.provider.serializers import (
    parse_provider_timestamp,
    provider_config_to_dict,
    provider_config_to_response,
    utcnow,
)


class ProviderService:
    """Async service for managing LLM provider configurations."""

    def __init__(self, store: ProviderConfigStore | None = None) -> None:
        self._store = store or ProviderConfigStore()

    async def list_configs(self) -> list[ModelConfigResponse]:
        """List all provider configurations."""
        return [
            provider_config_to_response(provider)
            for provider in self._store.load_provider_configs()
        ]

    async def list_configs_raw(self) -> list[dict[str, Any]]:
        """Return raw dicts with plaintext api_key for internal server-side use."""
        return [
            provider_config_to_dict(provider)
            for provider in self._store.load_provider_configs()
        ]

    async def get_default_config(self) -> ModelConfigResponse | None:
        """Get the default provider configuration."""
        for provider in self._store.load_provider_configs():
            if provider.get("is_default"):
                return provider_config_to_response(provider)
        return None

    async def create_config(self, config_in: ModelConfigCreate) -> ModelConfigResponse:
        """Create a new provider configuration."""
        name = config_in.name.strip()
        if not name:
            raise ValueError("Model configuration name cannot be empty.")

        config_id = str(uuid.uuid4())
        created_at = utcnow().isoformat()

        def mutator(config: dict[str, Any]) -> dict[str, Any]:
            providers = [
                dict(provider)
                for provider in (config.get("providers") or [])
                if isinstance(provider, dict)
            ]
            if any(str(provider.get("name") or "").strip() == name for provider in providers):
                raise ValueError("A model configuration with this name already exists.")

            make_default = bool(config_in.is_default or not providers)
            if make_default:
                for provider in providers:
                    provider["is_default"] = False

            providers.append(
                {
                    "id": config_id,
                    "name": name,
                    "provider_type": config_in.provider_type,
                    "api_key": config_in.api_key or "",
                    "api_base_url": config_in.api_base_url,
                    "default_max_tokens": config_in.default_max_tokens,
                    "custom_parameters": dict(config_in.custom_parameters or {}),
                    "models": list(config_in.models),
                    "is_default": make_default,
                    "created_at": created_at,
                    "updated_at": created_at,
                }
            )
            config["providers"] = providers
            return config

        updated = self._store.update_provider_configs(mutator)
        created = next(
            (
                provider
                for provider in updated.get("providers", [])
                if isinstance(provider, dict) and provider.get("id") == config_id
            ),
            None,
        )
        if created is None:
            raise RuntimeError("Failed to persist provider configuration.")
        return provider_config_to_response(created)

    async def update_config(
        self,
        config_id: str,
        config_in: ModelConfigUpdate,
    ) -> ModelConfigResponse | None:
        """Update an existing provider configuration."""
        update_data = config_in.model_dump(exclude_unset=True)
        clear_api_key = bool(update_data.pop("clear_api_key", False))

        normalized_name = None
        if "name" in update_data:
            normalized_name = str(update_data["name"] or "").strip()
            if not normalized_name:
                raise ValueError("Model configuration name cannot be empty.")
            update_data["name"] = normalized_name

        def mutator(config: dict[str, Any]) -> dict[str, Any]:
            providers = [
                dict(provider)
                for provider in (config.get("providers") or [])
                if isinstance(provider, dict)
            ]
            target_index = next(
                (index for index, provider in enumerate(providers) if provider.get("id") == config_id),
                None,
            )
            if target_index is None:
                return config

            if normalized_name is not None and any(
                str(provider.get("name") or "").strip() == normalized_name
                and provider.get("id") != config_id
                for provider in providers
            ):
                raise ValueError("A model configuration with this name already exists.")

            provider = dict(providers[target_index])

            if update_data.get("is_default") is True:
                for item in providers:
                    item["is_default"] = False
                provider["is_default"] = True
            elif "is_default" in update_data:
                provider["is_default"] = bool(update_data["is_default"])

            if "name" in update_data:
                provider["name"] = update_data["name"]
            if "provider_type" in update_data and update_data["provider_type"] is not None:
                provider["provider_type"] = update_data["provider_type"]
            if clear_api_key:
                provider["api_key"] = ""
            elif "api_key" in update_data and update_data["api_key"] is not None:
                provider["api_key"] = update_data["api_key"]
            if "api_base_url" in update_data:
                provider["api_base_url"] = update_data["api_base_url"]
            if "default_max_tokens" in update_data and update_data["default_max_tokens"] is not None:
                provider["default_max_tokens"] = int(update_data["default_max_tokens"])
            if "custom_parameters" in update_data:
                provider["custom_parameters"] = dict(update_data["custom_parameters"] or {})
            if "models" in update_data:
                provider["models"] = list(update_data["models"] or [])

            provider["updated_at"] = utcnow().isoformat()
            providers[target_index] = provider
            config["providers"] = providers
            return config

        updated = self._store.update_provider_configs(mutator)
        provider = next(
            (
                item
                for item in updated.get("providers", [])
                if isinstance(item, dict) and item.get("id") == config_id
            ),
            None,
        )
        if provider is None:
            return None
        return provider_config_to_response(provider)

    async def delete_config(self, config_id: str) -> bool:
        """Delete a provider configuration."""
        deleted = False

        def mutator(config: dict[str, Any]) -> dict[str, Any]:
            nonlocal deleted
            providers = [
                dict(provider)
                for provider in (config.get("providers") or [])
                if isinstance(provider, dict)
            ]
            target = next(
                (provider for provider in providers if provider.get("id") == config_id),
                None,
            )
            if target is None:
                return config

            deleted = True
            remaining = [provider for provider in providers if provider.get("id") != config_id]
            if bool(target.get("is_default")) and remaining:
                promoted = max(
                    remaining,
                    key=lambda provider: parse_provider_timestamp(provider.get("created_at")),
                )
                for provider in remaining:
                    provider["is_default"] = provider.get("id") == promoted.get("id")
            config["providers"] = remaining
            return config

        self._store.update_provider_configs(mutator)
        return deleted
