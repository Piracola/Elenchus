"""Shared context-injection mode presets and normalization helpers."""

from __future__ import annotations

from typing import Any

CONTEXT_INJECTION_MODE_AUTO = "auto"
CONTEXT_INJECTION_MODE_CUSTOM = "custom"
CONTEXT_INJECTION_MODES = {
    CONTEXT_INJECTION_MODE_AUTO,
    "lean",
    "standard",
    "deep",
    CONTEXT_INJECTION_MODE_CUSTOM,
}

CONTEXT_POLICY_FIELD_LIMITS: dict[str, tuple[int, int]] = {
    "recent_turns_to_include": (1, 8),
    "evidence_items_per_agent": (1, 12),
    "exact_recent_entries_per_agent": (1, 12),
    "planning_entries_per_agent": (0, 6),
    "long_term_memory_entries_per_agent": (0, 12),
}

CONTEXT_INJECTION_PRESETS: dict[str, dict[str, int]] = {
    "lean": {
        "recent_turns_to_include": 1,
        "evidence_items_per_agent": 2,
        "exact_recent_entries_per_agent": 3,
        "planning_entries_per_agent": 1,
        "long_term_memory_entries_per_agent": 2,
    },
    "standard": {
        "recent_turns_to_include": 2,
        "evidence_items_per_agent": 4,
        "exact_recent_entries_per_agent": 4,
        "planning_entries_per_agent": 2,
        "long_term_memory_entries_per_agent": 4,
    },
    "deep": {
        "recent_turns_to_include": 4,
        "evidence_items_per_agent": 8,
        "exact_recent_entries_per_agent": 8,
        "planning_entries_per_agent": 4,
        "long_term_memory_entries_per_agent": 8,
    },
}

DEFAULT_CONTEXT_INJECTION_MODE = CONTEXT_INJECTION_MODE_AUTO
DEFAULT_CONTEXT_POLICY_VALUES = CONTEXT_INJECTION_PRESETS["standard"]


def normalize_context_injection_mode(value: Any) -> str:
    mode = str(value or "").strip().lower()
    return mode if mode in CONTEXT_INJECTION_MODES else DEFAULT_CONTEXT_INJECTION_MODE


def clamp_context_policy_value(field: str, value: Any) -> int:
    minimum, maximum = CONTEXT_POLICY_FIELD_LIMITS[field]
    fallback = DEFAULT_CONTEXT_POLICY_VALUES[field]
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = fallback
    return max(minimum, min(maximum, parsed))


def normalize_context_policy_values(values: dict[str, Any] | None) -> dict[str, int]:
    values = values or {}
    return {
        field: clamp_context_policy_value(field, values.get(field))
        for field in CONTEXT_POLICY_FIELD_LIMITS
    }


def infer_context_injection_mode(values: dict[str, Any] | None) -> str:
    values = values or {}
    if "context_injection_mode" in values:
        return normalize_context_injection_mode(values.get("context_injection_mode"))

    if not any(field in values for field in CONTEXT_POLICY_FIELD_LIMITS):
        return DEFAULT_CONTEXT_INJECTION_MODE

    normalized_values = normalize_context_policy_values(values)
    if normalized_values == CONTEXT_INJECTION_PRESETS["standard"]:
        return DEFAULT_CONTEXT_INJECTION_MODE
    for mode in ("lean", "deep"):
        if normalized_values == CONTEXT_INJECTION_PRESETS[mode]:
            return mode
    return CONTEXT_INJECTION_MODE_CUSTOM


def values_for_context_injection_mode(
    mode: str,
    current_values: dict[str, Any] | None = None,
) -> dict[str, int]:
    normalized_mode = normalize_context_injection_mode(mode)
    if normalized_mode in CONTEXT_INJECTION_PRESETS:
        return dict(CONTEXT_INJECTION_PRESETS[normalized_mode])
    if normalized_mode == CONTEXT_INJECTION_MODE_AUTO:
        return dict(DEFAULT_CONTEXT_POLICY_VALUES)
    return normalize_context_policy_values(current_values)
