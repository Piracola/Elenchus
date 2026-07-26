"""Shared result-count limits for every search call site."""

from __future__ import annotations

MIN_RESULTS_PER_QUERY = 1
#: Ceiling for one sub-query. Results are pasted into prompts, so this bounds
#: context growth regardless of what the user configures.
MAX_RESULTS_PER_QUERY = 10
DEFAULT_RESULTS_PER_QUERY = 5


def clamp_results_per_query(value: object) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        return DEFAULT_RESULTS_PER_QUERY
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return DEFAULT_RESULTS_PER_QUERY
    return max(MIN_RESULTS_PER_QUERY, min(MAX_RESULTS_PER_QUERY, parsed))


def resolve_results_per_query() -> int:
    """Configured results per sub-query, clamped to the supported range."""
    from app.config import get_settings

    return clamp_results_per_query(get_settings().search.max_results_per_query)
