"""
Demo model service — provides read-only model list for demo mode.
"""

from __future__ import annotations

from app.config import get_settings


def get_demo_models() -> list[dict]:
    """Return the list of allowed models in demo mode.

    Each dict contains the fields the frontend expects for the model selector.
    """
    settings = get_settings()
    allowed = settings.demo.allowed_models

    # Build entries from provider configs
    from app.dependencies import get_provider_service

    service = get_provider_service()
    result = []
    for cfg in service.list_configs_raw():
        for model in cfg.get("models", []):
            if model in allowed:
                result.append({
                    "id": cfg["id"],
                    "name": cfg["name"],
                    "provider_type": cfg.get("provider_type", "openai"),
                    "model": model,
                    "api_base_url": cfg.get("api_base_url", ""),
                    "default_max_tokens": cfg.get("default_max_tokens", 64000),
                    "enable_thinking": cfg.get("enable_thinking", False),
                    "custom_params": cfg.get("custom_params", {}),
                })

    # If no provider configs match, return minimal stubs
    if not result:
        result = [
            {"model": m, "name": m, "id": m, "provider_type": "openai", "default_max_tokens": 64000}
            for m in allowed
        ]

    return result
