"""Backward-compatible package shell for ``app.tools``.

Recommended entrypoint:
- New backend code should import tool entrypoints from ``app.tools`` and
  ``app.tools.*`` only.

Compatibility contract:
- ``app.agents.skills`` stays importable for older code.
- Package-level access to ``web_search`` and ``get_all_skills`` is preserved.
- Legacy submodule-style access such as ``app.agents.skills.metadata`` and
  ``skills.metadata`` is preserved for the mirrored tool modules listed in
  ``_MIRRORED_SUBMODULES``.
"""

from __future__ import annotations

from importlib import import_module

from app import tools as _tools_package
from app.tools import get_all_skills, web_search

__all__ = ["get_all_skills", "web_search"]
_MIRRORED_SUBMODULES = {
    "metadata",
    "search_formatter",
    "search_query_planner",
    "search_result_filter",
    "search_tool",
}


def __getattr__(name: str):
    """Delegate legacy package attributes to the canonical tool package."""
    if name in _MIRRORED_SUBMODULES:
        module = import_module(f"app.tools.{name}")
        globals()[name] = module
        return module
    return getattr(_tools_package, name)


def __dir__() -> list[str]:
    """Expose canonical tool attributes during introspection."""
    return sorted(set(__all__) | _MIRRORED_SUBMODULES | set(dir(_tools_package)))
