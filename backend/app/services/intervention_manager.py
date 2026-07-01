"""
Thread-safe intervention message manager.

This module provides a thread-safe alternative to the previous global dictionary
approach for storing pending user interventions. It uses asyncio.Lock to ensure
safe concurrent access across multiple runs.

Why this is needed:
- The previous implementation used a global dict which is not thread-safe
- Multiple concurrent runs could cause message mixing or loss
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

    Uses asyncio.Lock for each run to ensure safe concurrent access.
    Each run has its own lock to minimize contention.

    Usage:
        manager = InterventionManager()
        await manager.add_intervention(run_id, "User message")
        interventions = await manager.pop_interventions(run_id)
    """

    def __init__(self) -> None:
        self._interventions: dict[str, list[str]] = defaultdict(list)
        self._locks: dict[str, asyncio.Lock] = {}
        self._global_lock = asyncio.Lock()

    async def _get_run_lock(self, run_id: str) -> asyncio.Lock:
        """Get or create a lock for a specific run."""
        async with self._global_lock:
            if run_id not in self._locks:
                self._locks[run_id] = asyncio.Lock()
            return self._locks[run_id]

    async def add_intervention(self, run_id: str, content: str) -> None:
        """
        Add an intervention message to the queue for a run.

        Args:
            run_id: The debate run identifier
            content: The intervention message content
        """
        lock = await self._get_run_lock(run_id)
        async with lock:
            self._interventions[run_id].append(content)
            logger.debug(
                "Intervention added for run %s (total: %d)",
                run_id,
                len(self._interventions[run_id])
            )

    async def pop_interventions(self, run_id: str) -> list[str]:
        """
        Pop and return all pending interventions for a run.

        This is a destructive operation - the interventions are removed
        from the queue after being returned.

        Args:
            run_id: The debate run identifier

        Returns:
            List of intervention content strings (may be empty)
        """
        lock = await self._get_run_lock(run_id)
        async with lock:
            interventions = self._interventions.pop(run_id, [])
            if interventions:
                logger.debug(
                    "Popped %d interventions for run %s",
                    len(interventions),
                    run_id
                )
            return interventions

    async def get_interventions(self, run_id: str) -> list[str]:
        """
        Get (non-destructively) all pending interventions for a run.

        Args:
            run_id: The debate run identifier

        Returns:
            List of intervention content strings (may be empty)
        """
        lock = await self._get_run_lock(run_id)
        async with lock:
            return list(self._interventions.get(run_id, []))

    async def clear_run(self, run_id: str) -> None:
        """
        Clear all interventions and locks for a run.

        Should be called when a run ends to free memory.

        Args:
            run_id: The debate run identifier
        """
        async with self._global_lock:
            self._interventions.pop(run_id, None)
            self._locks.pop(run_id, None)
            logger.debug("Cleared intervention data for run %s", run_id)

    def get_stats(self) -> dict[str, Any]:
        """Return statistics about the intervention manager."""
        return {
            "active_runs": len(self._interventions),
            "total_interventions": sum(len(v) for v in self._interventions.values()),
            "runs": {
                run_id: len(interventions)
                for run_id, interventions in self._interventions.items()
            }
        }
