"""Centralized agent/provider configuration normalization."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.dependencies import get_provider_service


@dataclass(frozen=True)
class ResolvedProviderSelection:
    """Resolved provider identity and credentials for one invocation."""

    provider_id: str | None
    provider_type: str | None
    api_base_url: str | None
    api_key: str | None
    custom_parameters: dict[str, Any]


class AgentConfigService:
    """Normalize stored agent configs and resolve runtime provider credentials."""

    def __init__(self, provider_service: Any | None = None) -> None:
        self._provider_service = provider_service or get_provider_service()

    async def build_session_agent_configs(
        self,
        agent_configs: dict[str, dict[str, Any]] | None,
        participants: list[str],
    ) -> dict[str, dict[str, Any]]:
        """Normalize incoming session configs for safe persistence."""
        providers_by_id, default_provider = await self._load_providers()
        requested = {role: dict(config) for role, config in (agent_configs or {}).items()}
        normalized: dict[str, dict[str, Any]] = {}

        for role, config in requested.items():
            normalized[role] = self._normalize_for_storage(config, providers_by_id)

        roles_needed = set(participants + ["judge", "fact_checker"])
        if default_provider:
            default_model = self._default_model_for(default_provider)
            for role in roles_needed:
                if role in normalized:
                    continue
                normalized[role] = self._storage_config_from_provider(
                    default_provider,
                    model=default_model,
                )

        return normalized

    async def resolve_provider_selection(
        self,
        override: dict[str, Any] | None,
    ) -> ResolvedProviderSelection:
        """Resolve provider identity and credentials for runtime invocation."""
        override = dict(override or {})
        provider_id = override.get("provider_id")
        provider_type = override.get("provider_type")
        api_base_url = override.get("api_base_url")
        api_key = override.get("api_key")
        custom_parameters = self._normalize_custom_parameters(
            override.get("custom_parameters")
        )

        providers_by_id, default_provider = await self._load_providers()
        selected_provider = providers_by_id.get(provider_id) if provider_id else None

        if provider_id and selected_provider is None:
            raise ValueError(
                "Model invocation blocked: the selected provider was not found. "
                "Open Settings and re-select the provider for this agent."
            )

        if selected_provider is not None:
            provider_type = provider_type or selected_provider.get("provider_type")
            api_base_url = api_base_url or selected_provider.get("api_base_url")
            api_key = api_key or selected_provider.get("api_key")
            return ResolvedProviderSelection(
                provider_id=provider_id,
                provider_type=provider_type,
                api_base_url=api_base_url,
                api_key=api_key,
                custom_parameters={
                    **self._normalize_custom_parameters(
                        selected_provider.get("custom_parameters")
                    ),
                    **custom_parameters,
                },
            )

        if api_key:
            return ResolvedProviderSelection(
                provider_id=None,
                provider_type=provider_type,
                api_base_url=api_base_url,
                api_key=api_key,
                custom_parameters=custom_parameters,
            )

        if provider_type or api_base_url:
            if default_provider and self._matches_provider_hint(
                default_provider,
                provider_type,
                api_base_url,
            ):
                return ResolvedProviderSelection(
                    provider_id=default_provider.get("id"),
                    provider_type=provider_type or default_provider.get("provider_type"),
                    api_base_url=api_base_url or default_provider.get("api_base_url"),
                    api_key=default_provider.get("api_key"),
                    custom_parameters={
                        **self._normalize_custom_parameters(
                            default_provider.get("custom_parameters")
                        ),
                        **custom_parameters,
                    },
                )

            raise ValueError(
                "Model invocation blocked: this agent references provider settings "
                "without a matching provider credential. Open Settings and choose "
                "the provider explicitly for this agent."
            )

        if default_provider:
            return ResolvedProviderSelection(
                provider_id=default_provider.get("id"),
                provider_type=default_provider.get("provider_type"),
                api_base_url=default_provider.get("api_base_url"),
                api_key=default_provider.get("api_key"),
                custom_parameters=self._normalize_custom_parameters(
                    default_provider.get("custom_parameters")
                ),
            )

        return ResolvedProviderSelection(
            provider_id=None,
            provider_type=provider_type,
            api_base_url=api_base_url,
            api_key=None,
            custom_parameters=custom_parameters,
        )

    async def _load_providers(
        self,
    ) -> tuple[dict[str, dict[str, Any]], dict[str, Any] | None]:
        providers = await self._provider_service.list_configs_raw()
        providers_by_id = {
            provider["id"]: provider
            for provider in providers
            if provider.get("id")
        }
        default_provider = next(
            (provider for provider in providers if provider.get("is_default")),
            None,
        )
        return providers_by_id, default_provider

    def _normalize_for_storage(
        self,
        config: dict[str, Any],
        providers_by_id: dict[str, dict[str, Any]],
    ) -> dict[str, Any]:
        provider_id = config.get("provider_id")
        provider = providers_by_id.get(provider_id) if provider_id else None

        normalized = {
            key: value
            for key, value in config.items()
            if key != "api_key"
        }

        if provider is None:
            return normalized

        normalized["provider_id"] = provider_id
        normalized["provider_type"] = (
            normalized.get("provider_type")
            or provider.get("provider_type")
            or "openai"
        )
        normalized["api_base_url"] = (
            normalized.get("api_base_url")
            or provider.get("api_base_url")
        )
        normalized["model"] = normalized.get("model") or self._default_model_for(provider)
        return normalized

    def _storage_config_from_provider(
        self,
        provider: dict[str, Any],
        *,
        model: str,
    ) -> dict[str, Any]:
        config: dict[str, Any] = {
            "provider_id": provider.get("id"),
            "provider_type": provider.get("provider_type", "openai"),
            "api_base_url": provider.get("api_base_url"),
        }
        if model:
            config["model"] = model
        return config

    @staticmethod
    def _default_model_for(provider: dict[str, Any]) -> str:
        models = provider.get("models") or []
        return models[0] if models else ""

    @staticmethod
    def _matches_provider_hint(
        provider: dict[str, Any],
        provider_type: str | None,
        api_base_url: str | None,
    ) -> bool:
        provider_type_matches = (
            provider_type is None
            or provider_type == provider.get("provider_type")
        )
        api_base_matches = (
            api_base_url is None
            or api_base_url == provider.get("api_base_url")
        )
        return provider_type_matches and api_base_matches

    @staticmethod
    def _normalize_custom_parameters(value: Any) -> dict[str, Any]:
        if value is None:
            return {}
        if not isinstance(value, dict):
            raise ValueError(
                "Model invocation blocked: custom parameters must be a JSON object."
            )
        return dict(value)
