"""Compatibility wrapper for the unified runtime bus."""

from __future__ import annotations

from app.runtime.bus import RuntimeBus


class EventStreamGateway(RuntimeBus):
    """Backward-compatible alias for the unified runtime bus."""
