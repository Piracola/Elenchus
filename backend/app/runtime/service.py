"""Task manager for debate runtime runs."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any

from app.dependencies import get_intervention_manager
from app.runtime.orchestrator import DebateOrchestrator
from app.runtime.session_repository import SessionRuntimeRepository
from app.services import run_service
from app.models.schemas import RunStatus

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RunStartResult:
    """Result payload for starting a runtime run."""

    started: bool
    run: dict[str, Any] | None = None
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

    def is_running(self, run_id: str) -> bool:
        task = self._tasks.get(run_id)
        return task is not None and not task.done()

    async def reconcile_run_liveness(
        self,
        run_id: str,
        *,
        allow_initializing_stall: bool = True,
    ) -> dict[str, Any] | None:
        run_record = await run_service.get_run(run_id)
        if run_record is None:
            return None

        if self.is_running(run_id):
            return run_service.serialize_run_summary(run_record)

        status = str(run_record.status or "")
        if status == RunStatus.STOPPING.value:
            return await run_service.transition_run_to_cancelled(
                run_id,
                reason="停止请求已完成，运行已取消。",
                source="runtime.reconcile",
            )

        stallable_statuses = {
            RunStatus.RUNNING.value,
            RunStatus.RETRYING.value,
            RunStatus.RECOVERING.value,
        }
        if allow_initializing_stall:
            stallable_statuses.add(RunStatus.INITIALIZING.value)

        if status in stallable_statuses:
            return await run_service.transition_run_to_stalled(
                run_id,
                reason="运行任务已经结束，但未写回终态，已自动标记为 stalled。",
                source="runtime.reconcile",
            )

        return run_service.serialize_run_summary(run_record)

    async def reconcile_all_run_liveness(self) -> int:
        stale_run_ids = await run_service.list_inconsistent_nonterminal_run_ids()
        repaired = 0
        for run_id in stale_run_ids:
            summary = await self.reconcile_run_liveness(run_id)
            if summary is not None and summary.get("status") in {
                RunStatus.STALLED.value,
                RunStatus.CANCELLED.value,
            }:
                repaired += 1
        return repaired

    async def start_run(self, run_id: str) -> RunStartResult:
        async with self._task_lock:
            if self.is_running(run_id):
                return RunStartResult(
                    started=False,
                    message="This run is already running.",
                )

            await self.reconcile_run_liveness(run_id, allow_initializing_stall=False)
            run_record = await run_service.get_run(run_id)
            if run_record is None:
                return RunStartResult(
                    started=False,
                    message=f"Run {run_id} was not found.",
                )

            run_payload = await run_service.get_run_start_payload(run_id)
            if run_payload is None:
                return RunStartResult(
                    started=False,
                    message=f"Run start payload {run_id} was not found.",
                )

            session_data = await self._repository.get_session_for_run(run_id)
            if session_data is None:
                return RunStartResult(
                    started=False,
                    message=f"Session {run_record.session_id} was not found.",
                )

            if run_record.status == RunStatus.COMPLETED.value:
                return RunStartResult(
                    started=False,
                    message="Run is already completed.",
                )

            if run_record.status in {RunStatus.FAILED.value, RunStatus.CANCELLED.value}:
                return RunStartResult(
                    started=False,
                    message=f"Run {run_id} is {run_record.status} and cannot be resumed.",
                )

            run_summary = await run_service.transition_run_to_status(
                run_id,
                status=RunStatus.RUNNING,
                reason="辩论正在运行。",
                source="runtime.service",
            )
            task = asyncio.create_task(
                self._orchestrator.run_debate(
                    run_id=run_id,
                    session_id=run_record.session_id,
                    topic=str(run_payload.get("topic", session_data.get("topic", "")) or ""),
                    participants=list(
                        run_payload.get("participants")
                        or session_data.get("participants", ["proposer", "opposer"])
                    ),
                    max_turns=int(run_payload.get("max_turns", session_data.get("max_turns", 5)) or 5),
                    agent_configs=dict(run_payload.get("agent_configs") or session_data.get("agent_configs", {})),
                )
            )
            self._tasks[run_id] = task
            task.add_done_callback(lambda done_task, rid=run_id: self._cleanup_task(rid, done_task))

        return RunStartResult(started=True, run=run_summary or {"id": run_id}, session=session_data)

    async def stop_run(self, run_id: str) -> bool:
        await self.reconcile_run_liveness(run_id)
        async with self._task_lock:
            task = self._tasks.get(run_id)
            if task and not task.done():
                task.cancel()
                return True
            return False

    async def queue_intervention(self, run_id: str, content: str) -> bool:
        run_record = await run_service.get_run(run_id)
        if run_record is None:
            return False
        await self._intervention_manager.add_intervention(run_id, content)
        return self.is_running(run_id)

    def _cleanup_task(self, run_id: str, done_task: asyncio.Task) -> None:
        current_task = self._tasks.get(run_id)
        if current_task is done_task:
            self._tasks.pop(run_id, None)
        if done_task.cancelled():
            return
        try:
            error = done_task.exception()
        except asyncio.CancelledError:
            return
        if error is not None:
            logger.error(
                "Runtime task failed for run %s: %s",
                run_id,
                error,
                exc_info=(type(error), error, error.__traceback__),
            )
