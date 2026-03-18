"""Protocols for pluggable debate engines."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any, Protocol


class DebateEngine(Protocol):
    """Engine contract for emitting runtime state snapshots."""

    def stream(self, initial_state: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
        """Yield successive state snapshots for one debate run."""
        ...
