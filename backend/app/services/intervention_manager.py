"""
Thread-safe intervention message manager.

This module provides a thread-safe alternative to the previous global dictionary
approach for storing pending user interventions. It uses asyncio.Lock to ensure
safe concurrent access across multiple sessions.

Why this is needed:
- The previous implementation used a global dict which is not thread-safe
- Multiple concurrent debates could cause message mixing or loss
- This implementation provides proper synchronization for concurrent access
"""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from typing import Any

logger = logging.getLogger(__name__)


class InterventionManager:
    """
    Thread-safe manager for pending user interventions.

    Uses asyncio.Lock for each session to ensure safe concurrent access.
    Each session has its own lock to minimize contention.

    Usage:
        manager = InterventionManager()
        await manager.add_intervention(session_id, "User message")
        interventions = await manager.pop_interventions(session_id)
    """

    def __init__(self) -> None:
        # Per-session list of intervention content strings
        self._interventions: dict[str, list[str]] = defaultdict(list)
        # Per-session locks for thread-safe access
        self._locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)
        # Global lock for managing the locks dict itself
        self._global_lock = asyncio.Lock()

    async def _get_session_lock(self, session_id: str) -> asyncio.Lock:
        """Get or create a lock for a specific session."""
        async with self._global_lock:
            if session_id not in self._locks:
                self._locks[session_id] = asyncio.Lock()
            return self._locks[session_id]

    async def add_intervention(self, session_id: str, content: str) -> None:
        """
        Add an intervention message to the queue for a session.

        Args:
            session_id: The debate session identifier
            content: The intervention message content
        """
        lock = await self._get_session_lock(session_id)
        async with lock:
            self._interventions[session_id].append(content)
            logger.debug(
                "Intervention added for session %s (total: %d)",
                session_id,
                len(self._interventions[session_id])
            )

    async def pop_interventions(self, session_id: str) -> list[str]:
        """
        Pop and return all pending interventions for a session.

        This is a destructive operation - the interventions are removed
        from the queue after being returned.

        Args:
            session_id: The debate session identifier

        Returns:
            List of intervention content strings (may be empty)
        """
        lock = await self._get_session_lock(session_id)
        async with lock:
            interventions = self._interventions.pop(session_id, [])
            if interventions:
                logger.debug(
                    "Popped %d interventions for session %s",
                    len(interventions),
                    session_id
                )
            return interventions

    async def get_interventions(self, session_id: str) -> list[str]:
        """
        Get (non-destructively) all pending interventions for a session.

        Args:
            session_id: The debate session identifier

        Returns:
            List of intervention content strings (may be empty)
        """
        lock = await self._get_session_lock(session_id)
        async with lock:
            return list(self._interventions.get(session_id, []))

    async def clear_session(self, session_id: str) -> None:
        """
        Clear all interventions and locks for a session.

        Should be called when a session ends to free memory.

        Args:
            session_id: The debate session identifier
        """
        async with self._global_lock:
            self._interventions.pop(session_id, None)
            self._locks.pop(session_id, None)
            logger.debug("Cleared intervention data for session %s", session_id)

    def get_active_session_count(self) -> int:
        """Return the number of sessions with pending interventions."""
        return len(self._interventions)

    def get_stats(self) -> dict[str, Any]:
        """Return statistics about the intervention manager."""
        return {
            "active_sessions": len(self._interventions),
            "total_interventions": sum(len(v) for v in self._interventions.values()),
            "sessions": {
                sid: len(interventions)
                for sid, interventions in self._interventions.items()
            }
        }


# Singleton instance - shared across the application
_intervention_manager: InterventionManager | None = None


def get_intervention_manager() -> InterventionManager:
    """
    Get the singleton InterventionManager instance.

    Creates the instance on first call. Thread-safe via module-level import lock.
    """
    global _intervention_manager
    if _intervention_manager is None:
        _intervention_manager = InterventionManager()
    return _intervention_manager
