"""Search provider registry.

This module is the single source of truth for which providers exist, what they
are called, and which fields they need. It deliberately imports nothing from
`app.config` so the config layer can depend on it without a cycle.
"""

from __future__ import annotations

from app.search.base import ProviderFieldSpec, SearchProvider

_REGISTRY: dict[str, type[SearchProvider]] = {}
_MODULES_LOADED = False


def register_search_provider(cls: type[SearchProvider]) -> type[SearchProvider]:
    """Class decorator that adds a provider to the registry."""
    if not cls.name:
        raise ValueError(f"{cls.__name__} must define a non-empty `name`.")
    if cls.name in _REGISTRY and _REGISTRY[cls.name] is not cls:
        raise ValueError(f"Search provider '{cls.name}' is already registered.")
    _REGISTRY[cls.name] = cls
    return cls


def _ensure_providers_loaded() -> None:
    """Import the provider modules so their decorators run.

    Done lazily rather than at module import so provider modules can import
    this one without depending on import order.
    """
    global _MODULES_LOADED
    if _MODULES_LOADED:
        return
    _MODULES_LOADED = True
    import logging
    from importlib import import_module

    for module_name in ("ddgs", "tavily", "brave", "exa", "custom"):
        try:
            import_module(f"app.search.{module_name}")
        except Exception:
            # A provider whose optional dependency is missing must degrade to
            # "unavailable" — config normalization depends on this registry and
            # must never fail because of one search backend.
            logging.getLogger(__name__).warning(
                "Search provider module '%s' could not be loaded; skipping it.",
                module_name,
                exc_info=True,
            )


def provider_classes() -> list[type[SearchProvider]]:
    """Registered providers ordered by fallback priority, then name."""
    _ensure_providers_loaded()
    return sorted(_REGISTRY.values(), key=lambda cls: (cls.fallback_priority, cls.name))


def provider_names() -> tuple[str, ...]:
    """Registered provider names in fallback order."""
    return tuple(cls.name for cls in provider_classes())


def get_provider_class(name: str) -> type[SearchProvider] | None:
    _ensure_providers_loaded()
    return _REGISTRY.get(name)


def provider_field_specs(name: str) -> tuple[ProviderFieldSpec, ...]:
    provider_class = get_provider_class(name)
    return provider_class.config_fields if provider_class else ()


def default_provider_name() -> str:
    """The provider used when configuration is missing or invalid.

    This is the last provider in fallback order: the one that works with no
    configuration at all.
    """
    classes = provider_classes()
    return classes[-1].name if classes else ""


def secret_field_paths() -> tuple[tuple[str, str], ...]:
    """`(provider_name, field_key)` pairs for every field stored encrypted."""
    return tuple(
        (cls.name, key)
        for cls in provider_classes()
        for key in cls.secret_field_keys()
    )


def default_provider_settings() -> dict[str, dict[str, str]]:
    """Empty settings scaffold for every registered provider."""
    return {
        cls.name: {field.key: "" for field in cls.config_fields}
        for cls in provider_classes()
        if cls.config_fields
    }
