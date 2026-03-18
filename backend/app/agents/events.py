"""Event broadcaster protocol used by the runtime layer."""

from __future__ import annotations

from typing import Any, Protocol


class EventBroadcaster(Protocol):
    """
    Protocol for event broadcasting.
    """

    async def broadcast(self, session_id: str, message: dict[str, Any]) -> None:
        ...
