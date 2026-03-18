"""Task manager for debate runtime sessions."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

from app.dependencies import get_intervention_manager
from app.runtime.orchestrator import DebateOrchestrator
from app.runtime.session_repository import SessionRuntimeRepository


@dataclass(frozen=True)
class SessionStartResult:
    """Result payload for starting a runtime session."""

    started: bool
    session: dict[str, Any] | None = None
    message: str | None = None


class DebateRuntimeService:
    """Own long-running debate tasks independently from any transport layer."""

    def __init__(
        self,
        *,
        repository: SessionRuntimeRepository | None = None,
        orchestrator: DebateOrchestrator | None = None,
        intervention_manager: Any | None = None,
    ) -> None:
        self._repository = repository or SessionRuntimeRepository()
        self._orchestrator = orchestrator or DebateOrchestrator(repository=self._repository)
        self._intervention_manager = intervention_manager or get_intervention_manager()
        self._tasks: dict[str, asyncio.Task] = {}
        self._task_lock = asyncio.Lock()

    def is_running(self, session_id: str) -> bool:
        task = self._tasks.get(session_id)
        return task is not None and not task.done()

    async def start_session(self, session_id: str) -> SessionStartResult:
        async with self._task_lock:
            if self.is_running(session_id):
                return SessionStartResult(
                    started=False,
                    message="This session is already running.",
                )

            session_data = await self._repository.get_session(session_id)
            if session_data is None:
                return SessionStartResult(
                    started=False,
                    message=f"Session {session_id} was not found.",
                )

            task = asyncio.create_task(
                self._orchestrator.run_debate(
                    session_id=session_id,
                    topic=session_data.get("topic", ""),
                    participants=session_data.get("participants", ["proposer", "opposer"]),
                    max_turns=session_data.get("max_turns", 5),
                    agent_configs=session_data.get("agent_configs", {}),
                )
            )
            self._tasks[session_id] = task
            task.add_done_callback(
                lambda done_task, sid=session_id: self._cleanup_task(sid, done_task)
            )

        return SessionStartResult(started=True, session=session_data)

    async def stop_session(self, session_id: str) -> bool:
        async with self._task_lock:
            task = self._tasks.get(session_id)
            if task and not task.done():
                task.cancel()
                return True
            return False

    async def queue_intervention(self, session_id: str, content: str) -> bool:
        await self._intervention_manager.add_intervention(session_id, content)
        return self.is_running(session_id)

    def _cleanup_task(self, session_id: str, done_task: asyncio.Task) -> None:
        current_task = self._tasks.get(session_id)
        if current_task is done_task:
            self._tasks.pop(session_id, None)
