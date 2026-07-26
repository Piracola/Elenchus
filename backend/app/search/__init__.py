"""Search providers package.

Exports are lazy: the config layer imports `app.search.registry`, and eagerly
importing `factory` here would pull `app.config` back in mid-initialization.
"""

from __future__ import annotations

from importlib import import_module
from typing import Any

__all__ = [
    "CustomSearchProvider",
    "ProviderFieldSpec",
    "SearchProvider",
    "SearchProviderFactory",
    "SearchResult",
]

_EXPORTS: dict[str, tuple[str, str]] = {
    "SearchProvider": ("app.search.base", "SearchProvider"),
    "SearchResult": ("app.search.base", "SearchResult"),
    "ProviderFieldSpec": ("app.search.base", "ProviderFieldSpec"),
    "CustomSearchProvider": ("app.search.custom", "CustomSearchProvider"),
    "SearchProviderFactory": ("app.search.factory", "SearchProviderFactory"),
}


def __getattr__(name: str) -> Any:
    target = _EXPORTS.get(name)
    if target is None:
        raise AttributeError(f"module 'app.search' has no attribute '{name}'")
    module_name, attr_name = target
    value = getattr(import_module(module_name), attr_name)
    globals()[name] = value
    return value
