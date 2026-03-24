"""
Provider configuration service backed by runtime/config.json.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from app.models.schemas import ModelConfigCreate, ModelConfigResponse, ModelConfigUpdate
from app.runtime_config_store import load_runtime_config, update_runtime_config


def has_configured_api_key(value: str | None) -> bool:
    return bool((value or "").strip())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _parse_timestamp(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    text = str(value or "").strip()
    if text:
        try:
            return datetime.fromisoformat(text)
        except ValueError:
            pass
    return _utcnow()


def _sort_provider_configs(providers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        providers,
        key=lambda provider: (
            bool(provider.get("is_default")),
            _parse_timestamp(provider.get("created_at")),
        ),
        reverse=True,
    )


class ProviderService:
    """Async service for managing LLM provider configurations."""

    @staticmethod
    def _load_provider_configs() -> list[dict[str, Any]]:
        config = load_runtime_config()
        providers = config.get("providers")
        if not isinstance(providers, list):
            return []
        return _sort_provider_configs(
            [dict(provider) for provider in providers if isinstance(provider, dict)]
        )

    @staticmethod
    def _config_to_response(provider: dict[str, Any]) -> ModelConfigResponse:
        return ModelConfigResponse(
            id=str(provider.get("id") or ""),
            name=str(provider.get("name") or ""),
            provider_type=str(provider.get("provider_type") or "openai"),
            api_key_configured=has_configured_api_key(str(provider.get("api_key") or "")),
            api_base_url=provider.get("api_base_url"),
            custom_parameters=dict(provider.get("custom_parameters") or {}),
            models=[str(model) for model in (provider.get("models") or []) if str(model)],
            is_default=bool(provider.get("is_default", False)),
            created_at=_parse_timestamp(provider.get("created_at")),
            updated_at=_parse_timestamp(provider.get("updated_at")),
        )

    @staticmethod
    def _config_to_dict(provider: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": str(provider.get("id") or ""),
            "name": str(provider.get("name") or ""),
            "provider_type": str(provider.get("provider_type") or "openai"),
            "api_key": str(provider.get("api_key") or ""),
            "api_base_url": provider.get("api_base_url"),
            "custom_parameters": dict(provider.get("custom_parameters") or {}),
            "models": [str(model) for model in (provider.get("models") or []) if str(model)],
            "is_default": bool(provider.get("is_default", False)),
            "created_at": _parse_timestamp(provider.get("created_at")),
            "updated_at": _parse_timestamp(provider.get("updated_at")),
        }

    async def list_configs(self) -> list[ModelConfigResponse]:
        """List all provider configurations."""
        return [
            self._config_to_response(provider)
            for provider in self._load_provider_configs()
        ]

    async def list_configs_raw(self) -> list[dict[str, Any]]:
        """Return raw dicts with plaintext api_key for internal server-side use."""
        return [
            self._config_to_dict(provider)
            for provider in self._load_provider_configs()
        ]

    async def get_default_config(self) -> ModelConfigResponse | None:
        """Get the default provider configuration."""
        for provider in self._load_provider_configs():
            if provider.get("is_default"):
                return self._config_to_response(provider)
        return None

    async def create_config(self, config_in: ModelConfigCreate) -> ModelConfigResponse:
        """Create a new provider configuration."""
        name = config_in.name.strip()
        if not name:
            raise ValueError("Model configuration name cannot be empty.")

        config_id = str(uuid.uuid4())
        created_at = _utcnow().isoformat()

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
                    "custom_parameters": dict(config_in.custom_parameters or {}),
                    "models": list(config_in.models),
                    "is_default": make_default,
                    "created_at": created_at,
                    "updated_at": created_at,
                }
            )
            config["providers"] = providers
            return config

        updated = update_runtime_config(mutator)
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
        return self._config_to_response(created)

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
            if "custom_parameters" in update_data:
                provider["custom_parameters"] = dict(update_data["custom_parameters"] or {})
            if "models" in update_data:
                provider["models"] = list(update_data["models"] or [])

            provider["updated_at"] = _utcnow().isoformat()
            providers[target_index] = provider
            config["providers"] = providers
            return config

        updated = update_runtime_config(mutator)
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
        return self._config_to_response(provider)

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
                    key=lambda provider: _parse_timestamp(provider.get("created_at")),
                )
                for provider in remaining:
                    provider["is_default"] = provider.get("id") == promoted.get("id")
            config["providers"] = remaining
            return config

        update_runtime_config(mutator)
        return deleted
