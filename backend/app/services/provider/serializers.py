from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.models.schemas import ModelConfigResponse


def has_configured_api_key(value: str | None) -> bool:
    return bool((value or "").strip())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def parse_provider_timestamp(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    text = str(value or "").strip()
    if text:
        try:
            return datetime.fromisoformat(text)
        except ValueError:
            pass
    return utcnow()


def sort_provider_configs(providers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        providers,
        key=lambda provider: (
            bool(provider.get("is_default")),
            parse_provider_timestamp(provider.get("created_at")),
        ),
        reverse=True,
    )


def provider_config_to_response(provider: dict[str, Any]) -> ModelConfigResponse:
    return ModelConfigResponse(
        id=str(provider.get("id") or ""),
        name=str(provider.get("name") or ""),
        provider_type=str(provider.get("provider_type") or "openai"),
        api_key_configured=has_configured_api_key(str(provider.get("api_key") or "")),
        api_base_url=provider.get("api_base_url"),
        default_max_tokens=int(provider.get("default_max_tokens") or 64000),
        custom_parameters=dict(provider.get("custom_parameters") or {}),
        models=[str(model) for model in (provider.get("models") or []) if str(model)],
        is_default=bool(provider.get("is_default", False)),
        created_at=parse_provider_timestamp(provider.get("created_at")),
        updated_at=parse_provider_timestamp(provider.get("updated_at")),
    )


def provider_config_to_dict(provider: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(provider.get("id") or ""),
        "name": str(provider.get("name") or ""),
        "provider_type": str(provider.get("provider_type") or "openai"),
        "api_key": str(provider.get("api_key") or ""),
        "api_base_url": provider.get("api_base_url"),
        "default_max_tokens": int(provider.get("default_max_tokens") or 64000),
        "custom_parameters": dict(provider.get("custom_parameters") or {}),
        "models": [str(model) for model in (provider.get("models") or []) if str(model)],
        "is_default": bool(provider.get("is_default", False)),
        "created_at": parse_provider_timestamp(provider.get("created_at")),
        "updated_at": parse_provider_timestamp(provider.get("updated_at")),
    }
