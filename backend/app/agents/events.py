"""
Event emitter interface for decoupling agents layer from API layer.

This module provides an abstraction layer that allows the agents module
to broadcast events without directly depending on the websocket module.
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class EventBroadcaster(Protocol):
    """
    Protocol for event broadcasting.
    
    Implementations can broadcast events via WebSocket, SSE, or other means.
    This decouples the agents layer from the specific transport mechanism.
    """
    
    async def broadcast(self, session_id: str, message: dict[str, Any]) -> None:
        """
        Broadcast an event to all clients subscribed to a session.
        
        Args:
            session_id: The session identifier
            message: The event message to broadcast
        """
        ...


_broadcaster: EventBroadcaster | None = None


def set_broadcaster(broadcaster: EventBroadcaster) -> None:
    """
    Set the global event broadcaster.
    
    This should be called once during application startup.
    
    Args:
        broadcaster: The broadcaster implementation to use
    """
    global _broadcaster
    _broadcaster = broadcaster


def get_broadcaster() -> EventBroadcaster | None:
    """
    Get the current event broadcaster.
    
    Returns:
        The broadcaster if set, None otherwise
    """
    return _broadcaster


async def broadcast_event(session_id: str, message: dict[str, Any]) -> None:
    """
    Convenience function to broadcast an event.
    
    Safely handles the case where no broadcaster is set.
    
    Args:
        session_id: The session identifier
        message: The event message to broadcast
    """
    if _broadcaster is not None:
        await _broadcaster.broadcast(session_id, message)
