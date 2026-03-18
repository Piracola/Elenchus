"""Agents package for LangGraph-based debate agents.

Exports are loaded lazily to avoid runtime/agents circular imports.
"""

from __future__ import annotations

from importlib import import_module
from typing import Any

__all__ = ["compile_debate_graph", "build_debate_graph", "run_debate"]

_EXPORTS: dict[str, tuple[str, str]] = {
    "compile_debate_graph": ("app.agents.graph", "compile_debate_graph"),
    "build_debate_graph": ("app.agents.graph", "build_debate_graph"),
    "run_debate": ("app.agents.runner", "run_debate"),
}


def __getattr__(name: str) -> Any:
    target = _EXPORTS.get(name)
    if target is None:
        raise AttributeError(f"module 'app.agents' has no attribute '{name}'")
    module_name, attr_name = target
    module = import_module(module_name)
    value = getattr(module, attr_name)
    globals()[name] = value
    return value

