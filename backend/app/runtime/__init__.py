"""Runtime orchestration layer for debate execution.

This package uses lazy attribute imports to avoid import cycles between
runtime/orchestrator modules and legacy agent package side effects.
"""

from __future__ import annotations

from importlib import import_module
from typing import Any

__all__ = [
    "DebateOrchestrator",
    "DebateRuntimeService",
    "SessionRuntimeRepository",
    "SessionStartResult",
    "EventStreamGateway",
    "RuntimeEvent",
]

_EXPORTS: dict[str, tuple[str, str]] = {
    "DebateOrchestrator": ("app.runtime.orchestrator", "DebateOrchestrator"),
    "DebateRuntimeService": ("app.runtime.service", "DebateRuntimeService"),
    "SessionStartResult": ("app.runtime.service", "SessionStartResult"),
    "SessionRuntimeRepository": ("app.runtime.session_repository", "SessionRuntimeRepository"),
    "EventStreamGateway": ("app.runtime.event_gateway", "EventStreamGateway"),
    "RuntimeEvent": ("app.runtime.event_schema", "RuntimeEvent"),
}


def __getattr__(name: str) -> Any:
    target = _EXPORTS.get(name)
    if target is None:
        raise AttributeError(f"module 'app.runtime' has no attribute '{name}'")
    module_name, attr_name = target
    module = import_module(module_name)
    value = getattr(module, attr_name)
    globals()[name] = value
    return value

