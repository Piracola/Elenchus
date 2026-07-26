"""Runtime orchestrator that coordinates persistence and event delivery."""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from app.llm.failure_budget import (
    FailureBudgetExhausted,
    budget_from_config,
    reset_failure_budget,
    set_failure_budget,
)
from app.models.schemas import RunStatus
from app.runtime.engines import DebateEngine, LangGraphDebateEngine
from app.runtime.event_emitter import EventEmitter, RuntimeEventEmitter, noop_emit_event
from app.runtime.session_repository import SessionRuntimeRepository
from app.services import run_service
from app.text_repair import format_runtime_error_message

if TYPE_CHECKING:
    from app.runtime.bus import RuntimeBus

logger = logging.getLogger(__name__)

_PERSIST_NODES = frozenset(
    {
        "advance_turn",
        "judge",
        "speaker",
        "fact_check",
        "group_discussion",
        "consensus",
        "sophistry_speaker",
        "sophistry_observer",
        "sophistry_postmortem",
    }
)

# Nodes whose in-flight work can be aborted mid-generation by an interrupt.
_INTERRUPTIBLE_NODES = frozenset({"speaker", "sophistry_speaker"})

# Backstop so a client spamming directives cannot starve the debate loop.
_MAX_REINJECTIONS = 25

_STREAM_DONE = object()
_STREAM_INTERRUPTED = object()


def _read_failure_budget_config() -> dict[str, Any]:
    """Load `debate.failure_budget`, tolerating a missing or broken config."""
    try:
        from app.runtime_config_store import read_runtime_section

        debate = read_runtime_section("debate")
        if isinstance(debate, dict) and isinstance(debate.get("failure_budget"), dict):
            return debate["failure_budget"]
    except Exception:  # pragma: no cover - defensive
        logger.warning("Failed to read failure budget config; using defaults", exc_info=True)
    return {}


class DebateOrchestrator:
    """Coordinate a debate engine with persistence and outbound events."""

    def __init__(
        self,
        *,
        repository: SessionRuntimeRepository | None = None,
        engine: DebateEngine | None = None,
        runtime_bus: RuntimeBus | None = None,
        event_gateway: RuntimeBus | None = None,
        emit_event: EventEmitter = noop_emit_event,
    ) -> None:
        self._repository = repository or SessionRuntimeRepository()
        self._engine = engine or LangGraphDebateEngine()
        resolved_runtime_bus = runtime_bus or event_gateway
        self._events = RuntimeEventEmitter(
            runtime_bus=resolved_runtime_bus,
            emit_event=emit_event,
        )

    async def run_debate(
        self,
        run_id: str,
        session_id: str,
        topic: str,
        participants: list[str] | None = None,
        max_turns: int = 5,
        agent_configs: dict[str, Any] | None = None,
        interrupt_event: asyncio.Event | None = None,
    ) -> dict[str, Any]:
        final_state: dict[str, Any] = {
            "run_id": run_id,
            "session_id": session_id,
            "topic": topic,
            "participants": participants or ["proposer", "opposer"],
            "max_turns": max_turns,
            "current_turn": 0,
            "current_speaker": "",
            "current_speaker_index": -1,
            "dialogue_history": [],
            "judge_history": [],
            "shared_knowledge": [],
            "messages": [],
            "current_scores": {},
            "cumulative_scores": {},
            "mode_artifacts": [],
            "status": "in_progress",
            "error": None,
            "agent_configs": agent_configs or {},
        }
        last_node = ""

        try:
            initial_state = await self._repository.build_initial_state(
                run_id,
                session_id,
                topic=topic,
                participants=participants,
                max_turns=max_turns,
                agent_configs=agent_configs,
            )
            if initial_state is None:
                raise ValueError(f"Session {session_id} was not found.")
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            return await self._finalize_startup_error(session_id, final_state, exc)

        debate_mode = str(initial_state.get("debate_mode", "standard") or "standard")
        last_checkpoint_node = str(initial_state.get("last_executed_node", "") or "")
        prior_resume_count = int(initial_state.get("resume_count", 0) or 0)
        initial_state["resume_count"] = prior_resume_count + 1
        run_events = self._events.for_run(run_id)
        initial_state["run_id"] = run_id
        initial_state["runtime_event_emitter"] = run_events
        initial_state["interrupted_at"] = None
        initial_state["last_progress_at"] = datetime.now(UTC).isoformat()

        logger.info(
            "Starting/Resuming debate: session=%s topic='%s' turns=%d mode=%s",
            session_id,
            topic,
            max_turns,
            debate_mode,
        )

        if prior_resume_count > 0 or last_checkpoint_node:
            checkpoint_label = last_checkpoint_node or "manage_context"
            await run_events.emit_runtime_event(
                session_id=session_id,
                event_type="system",
                payload={
                    "content": (
                        f"从上次检查点恢复：第 {int(initial_state.get('current_turn', 0)) + 1} 轮，"
                        f"最近稳定节点是 {checkpoint_label}。"
                    )
                },
                source="runtime.orchestrator.resume",
            )

        await run_events.emit_runtime_event(
            session_id=session_id,
            event_type="system",
            payload={"content": f"辩论开始：{topic}"},
            source="runtime.orchestrator",
        )
        if debate_mode == "sophistry_experiment":
            await run_events.emit_runtime_event(
                session_id=session_id,
                event_type="mode_notice",
                payload={
                    "content": (
                        "诡辩实验模式已启用：本场不会使用搜索、组内讨论或裁判评分，"
                        "输出仅用于观察修辞操控与谬误对抗。"
                    )
                },
                source="runtime.orchestrator.mode",
                phase="processing",
            )
        await run_events.emit_runtime_event(
            session_id=session_id,
            event_type="status",
            payload={"content": "正在整理上下文...", "node": "manage_context"},
            source="runtime.orchestrator",
            phase="context",
        )

        final_state = dict(initial_state)
        prev_history_len = len(initial_state.get("dialogue_history", []))
        initial_knowledge = initial_state.get("shared_knowledge", [])
        prev_knowledge_len = len(initial_knowledge) if isinstance(initial_knowledge, list) else 0
        emitted_judge_keys: set[tuple[int, str]] = set()

        budget = budget_from_config(_read_failure_budget_config())
        budget_token = set_failure_budget(budget)
        run_started_at = datetime.now(UTC)
        try:
            last_status_node = "manage_context"
            # Directives queued while the run was stopped apply before the
            # graph starts, so they cost no extra re-entry.
            await self._inject_pending_interventions(
                run_id, session_id, initial_state, run_events
            )
            current_state = initial_state
            reinjections = 0

            while True:
                pending_break: str | None = None
                stream = self._engine.stream(current_state)
                try:
                    while True:
                        step = await self._advance_stream(
                            stream,
                            interrupt_event,
                            final_state,
                            run_events,
                            session_id,
                        )
                        if step is _STREAM_DONE:
                            break
                        if step is _STREAM_INTERRUPTED:
                            pending_break = "interrupt"
                            break
                        state_snapshot: dict[str, Any] = step  # type: ignore[assignment]
                        node_name = state_snapshot.get("last_executed_node", "")
                        final_state = dict(state_snapshot)
                        final_state["last_progress_at"] = datetime.now(UTC).isoformat()
                        prev_knowledge_len = await run_events.emit_memory_updates(
                            session_id,
                            final_state,
                            prev_knowledge_len,
                        )

                        if node_name and node_name != last_node:
                            last_node = node_name
                            status_message, _status_phase = run_events.describe_status(node_name)
                            final_state["last_status_message"] = status_message
                            last_status_node = await run_events.emit_status_if_changed(
                                session_id,
                                node_name,
                                last_status_node,
                            )

                            if node_name in {"speaker", "sophistry_speaker"}:
                                prev_history_len = await run_events.emit_speech(
                                    session_id,
                                    final_state,
                                    prev_history_len,
                                )
                            elif node_name == "group_discussion":
                                prev_history_len = await run_events.emit_discussion_entries(
                                    session_id,
                                    final_state,
                                    prev_history_len,
                                )
                            elif node_name in {"sophistry_observer", "sophistry_postmortem"}:
                                prev_history_len = await run_events.emit_sophistry_reports(
                                    session_id,
                                    final_state,
                                    prev_history_len,
                                )
                            elif node_name in {"tool_executor", "fact_check"}:
                                await run_events.emit_fact_check(session_id, final_state)
                            elif node_name == "judge":
                                await run_events.emit_judge_scores(
                                    session_id,
                                    final_state,
                                    emitted_judge_keys,
                                )
                            elif node_name == "advance_turn":
                                await run_events.emit_turn_complete(session_id, final_state)
                            elif node_name == "consensus":
                                prev_history_len = await run_events.emit_consensus_summary(
                                    session_id,
                                    final_state,
                                    prev_history_len,
                                )

                            next_status_node = run_events.predict_next_status_node(
                                node_name,
                                final_state,
                            )
                            if next_status_node is not None:
                                last_status_node = await run_events.emit_status_if_changed(
                                    session_id,
                                    next_status_node,
                                    last_status_node,
                                )

                        if node_name in _PERSIST_NODES:
                            await self._repository.persist_state(run_id, session_id, final_state)

                        elapsed_minutes = (
                            datetime.now(UTC) - run_started_at
                        ).total_seconds() / 60
                        if elapsed_minutes > budget.max_run_duration_minutes:
                            raise FailureBudgetExhausted(
                                "duration",
                                (
                                    f"运行时长已超过 {budget.max_run_duration_minutes} 分钟，"
                                    "已暂停，可稍后手动恢复。"
                                ),
                            )

                        # Node boundary: apply queued moderator directives by
                        # restarting the graph from the resumed node.
                        if await run_service.has_pending_interventions(run_id):
                            pending_break = "intervene"
                            break
                finally:
                    aclose = getattr(stream, "aclose", None)
                    if aclose is not None:
                        await aclose()

                if pending_break is None:
                    break

                reinjections += 1
                if reinjections > _MAX_REINJECTIONS:
                    logger.warning(
                        "Run %s hit the re-injection cap (%d); applying remaining "
                        "directives without further re-entry.",
                        run_id,
                        _MAX_REINJECTIONS,
                    )
                current_state = await self._prepare_reinjection_state(
                    run_id,
                    session_id,
                    final_state,
                    run_events,
                    interrupted=(pending_break == "interrupt"),
                )
                last_node = ""

            final_state["status"] = "completed"
            final_state["interrupted_at"] = None
            final_state["last_status_message"] = "辩论已完成"
            final_state["last_progress_at"] = datetime.now(UTC).isoformat()
            await self._repository.persist_state(run_id, session_id, final_state)
            await run_events.emit_runtime_event(
                session_id=session_id,
                event_type="debate_complete",
                payload={
                    "final_scores": final_state.get("cumulative_scores", {}),
                    "total_turns": final_state.get("current_turn", 0),
                    "final_report": final_state.get("final_mode_report"),
                },
                source="runtime.orchestrator",
            )
            await run_service.transition_run_to_status(
                run_id,
                status=RunStatus.COMPLETED,
                reason="辩论已完成",
                source="runtime.orchestrator",
            )

            logger.info(
                "Debate completed: session=%s turns=%d",
                session_id,
                final_state.get("current_turn", 0),
            )
        except asyncio.CancelledError:
            interrupted_at = datetime.now(UTC).isoformat()
            final_state["status"] = "cancelled"
            final_state["interrupted_at"] = interrupted_at
            final_state["last_progress_at"] = interrupted_at
            if last_node:
                final_state["last_executed_node"] = last_node
            final_state["last_status_message"] = "辩论已停止。"
            await self._repository.persist_state(run_id, session_id, final_state)
            await run_service.transition_run_to_status(
                run_id,
                status=RunStatus.CANCELLED,
                reason="辩论已停止。",
                source="runtime.orchestrator",
            )
            raise
        except FailureBudgetExhausted as exc:
            final_state = await self._handle_budget_exhausted(
                run_id, session_id, final_state, exc, last_node=last_node
            )
        except Exception as exc:
            final_state = await self._handle_debate_error(
                run_id, session_id, final_state, exc, last_node=last_node
            )
        finally:
            reset_failure_budget(budget_token)

        return final_state

    async def _handle_budget_exhausted(
        self,
        run_id: str,
        session_id: str,
        state: dict[str, Any],
        exc: FailureBudgetExhausted,
        last_node: str = "",
    ) -> dict[str, Any]:
        """Pause the run instead of failing it: progress stays resumable."""
        message = str(exc)
        logger.warning(
            "Debate paused by failure budget (%s): session=%s last_error=%s",
            exc.dimension,
            session_id,
            exc.last_error,
        )
        interrupted_at = datetime.now(UTC).isoformat()
        state["status"] = "in_progress"
        state["interrupted_at"] = interrupted_at
        state["last_progress_at"] = interrupted_at
        if last_node:
            state["last_executed_node"] = last_node
        state["last_status_message"] = message
        await self._repository.persist_state(run_id, session_id, state)

        run_events = self._events.for_run(run_id)
        await run_events.emit_runtime_event(
            session_id=session_id,
            event_type="status",
            payload={"content": message, "node": last_node or "manage_context"},
            source="runtime.orchestrator.budget",
            phase="processing",
        )
        await run_service.transition_run_to_stalled(
            run_id,
            reason=message,
            source="runtime.orchestrator.budget",
        )
        return state

    async def _advance_stream(
        self,
        stream: Any,
        interrupt_event: asyncio.Event | None,
        state: dict[str, Any],
        run_events: RuntimeEventEmitter,
        session_id: str,
    ) -> Any:
        """Pull the next node result, racing it against an interrupt request."""
        if interrupt_event is None:
            try:
                return await anext(stream)
            except StopAsyncIteration:
                return _STREAM_DONE

        next_task = asyncio.ensure_future(anext(stream))
        interrupt_task = asyncio.ensure_future(interrupt_event.wait())
        try:
            done, _pending = await asyncio.wait(
                {next_task, interrupt_task},
                return_when=asyncio.FIRST_COMPLETED,
            )
        except asyncio.CancelledError:
            next_task.cancel()
            interrupt_task.cancel()
            await asyncio.gather(next_task, interrupt_task, return_exceptions=True)
            raise

        if next_task in done:
            interrupt_task.cancel()
            await asyncio.gather(interrupt_task, return_exceptions=True)
            if interrupt_event.is_set():
                # The node finished first; treat the directive as queued so it
                # applies at this boundary instead of discarding work.
                interrupt_event.clear()
            try:
                return next_task.result()
            except StopAsyncIteration:
                return _STREAM_DONE

        # Interrupt won the race.
        interrupt_event.clear()
        running_node = run_events.predict_next_status_node(
            str(state.get("last_executed_node", "") or ""),
            state,
        )
        if running_node not in _INTERRUPTIBLE_NODES:
            # Not generating a speech: let the node finish and pick the
            # directive up at the boundary check.
            try:
                return await next_task
            except StopAsyncIteration:
                return _STREAM_DONE

        next_task.cancel()
        await asyncio.gather(next_task, return_exceptions=True)
        await self._emit_interrupted_speech_cancel(session_id, state, run_events)
        return _STREAM_INTERRUPTED

    async def _emit_interrupted_speech_cancel(
        self,
        session_id: str,
        state: dict[str, Any],
        run_events: RuntimeEventEmitter,
    ) -> None:
        """Roll back the half-streamed speech the aborted node was producing."""
        role = str(state.get("current_speaker", "") or "")
        if not role:
            return
        role_config = (state.get("agent_configs", {}) or {}).get(role, {})
        agent_name = str(role_config.get("custom_name", role) or role)
        try:
            await run_events.emit_speech_cancel(
                session_id,
                role=role,
                agent_name=agent_name,
                turn=int(state.get("current_turn", 0) or 0),
            )
        except Exception:  # pragma: no cover - defensive
            logger.warning("Failed to emit speech_cancel after interrupt", exc_info=True)

    def _build_directive_entry(self, command: dict[str, Any], turn: int) -> dict[str, Any]:
        payload = command.get("payload") or {}
        return {
            "role": "audience",
            "agent_name": "主持人",
            "intervention_kind": "moderator_directive",
            "content": str(payload.get("content", "") or ""),
            "timestamp": datetime.now(UTC).isoformat(),
            "citations": [],
            "turn": turn,
            "command_id": str(command.get("id") or ""),
            # Shared id keeps snapshot and event streams from double-inserting.
            "event_id": str(command.get("id") or ""),
        }

    async def _inject_pending_interventions(
        self,
        run_id: str,
        session_id: str,
        state: dict[str, Any],
        run_events: RuntimeEventEmitter,
    ) -> list[dict[str, Any]]:
        """Move queued moderator directives into the debate state."""
        pending = await run_service.list_pending_commands(run_id)
        if not pending:
            return []

        history = state.get("dialogue_history")
        history = list(history) if isinstance(history, list) else []
        existing_ids = {
            str(entry.get("event_id", "") or "")
            for entry in history
            if isinstance(entry, dict)
        }
        turn = int(state.get("current_turn", 0) or 0)
        new_entries = [
            self._build_directive_entry(command, turn)
            for command in pending
            if str(command.get("id") or "") not in existing_ids
        ]
        if new_entries:
            state["dialogue_history"] = history + new_entries

        await run_service.consume_pending_interventions(run_id)

        for entry in new_entries:
            await run_events.emit_runtime_event(
                session_id=session_id,
                event_type="audience_message",
                payload={
                    "content": entry["content"],
                    "role": "audience",
                    "agent_name": entry["agent_name"],
                    "turn": entry["turn"],
                    "timestamp": entry["timestamp"],
                    "kind": "moderator_directive",
                    "command_id": entry["command_id"],
                    "entry": entry,
                },
                source="runtime.orchestrator.intervention",
            )
        return new_entries

    async def _prepare_reinjection_state(
        self,
        run_id: str,
        session_id: str,
        state: dict[str, Any],
        run_events: RuntimeEventEmitter,
        *,
        interrupted: bool,
    ) -> dict[str, Any]:
        """Build the state the graph re-enters with after a directive lands."""
        from app.runtime.runtime_status import predict_resume_next_node
        from app.runtime.session_snapshot_normalizer import SAFE_RESUME_NODES

        next_state = dict(state)
        last_node = str(next_state.get("last_executed_node", "") or "")
        current_turn = int(next_state.get("current_turn", 0) or 0)

        if last_node and last_node not in SAFE_RESUME_NODES:
            resume_node = predict_resume_next_node(last_node, next_state)
            if resume_node:
                next_state["resume_next_node"] = resume_node
                next_state["resume_origin_turn"] = current_turn
        else:
            next_state.pop("resume_next_node", None)
            next_state.pop("resume_origin_turn", None)

        injected = await self._inject_pending_interventions(
            run_id, session_id, next_state, run_events
        )
        await self._repository.persist_state(run_id, session_id, next_state)

        if injected:
            await run_events.emit_runtime_event(
                session_id=session_id,
                event_type="status",
                payload={
                    "content": (
                        "主持人已打断当前发言，辩手将结合指令重新发言..."
                        if interrupted
                        else "主持人指令已送达，将在下一位发言中被正面回应..."
                    ),
                    "node": "manage_context",
                },
                source="runtime.orchestrator.intervention",
                phase="context",
            )
        return next_state

    async def _handle_debate_error(
        self,
        run_id: str,
        session_id: str,
        state: dict[str, Any],
        exc: Exception,
        last_node: str = "",
    ) -> dict[str, Any]:
        """Common error handler for both startup and runtime errors."""
        user_facing_error = format_runtime_error_message(exc)
        logger.error(
            "Debate failed: session=%s error=%s",
            session_id,
            exc,
            exc_info=True,
        )
        state["status"] = "error"
        state["error"] = user_facing_error
        state["interrupted_at"] = datetime.now(UTC).isoformat()
        state["last_progress_at"] = state["interrupted_at"]
        if last_node:
            state["last_executed_node"] = last_node
        state["last_status_message"] = user_facing_error

        dialogue_history = state.get("dialogue_history")
        if not isinstance(dialogue_history, list):
            dialogue_history = []
            state["dialogue_history"] = dialogue_history

        dialogue_history.append(
            {
                "role": "error",
                "content": f"系统运行出错：{user_facing_error}",
                "timestamp": datetime.now(UTC).isoformat() + "Z",
                "agent_name": "系统",
                "citations": [],
            }
        )
        await self._repository.persist_state(run_id, session_id, state)
        await self._events.for_run(run_id).emit_runtime_event(
            session_id=session_id,
            event_type="error",
            payload={"content": f"辩论出错：{user_facing_error}"},
            source="runtime.orchestrator",
            phase="error",
        )
        await run_service.transition_run_to_status(
            run_id,
            status=RunStatus.FAILED,
            reason=user_facing_error,
            source="runtime.orchestrator",
            error_message=user_facing_error,
        )
        return state

    async def _finalize_startup_error(
        self,
        session_id: str,
        final_state: dict[str, Any],
        exc: Exception,
    ) -> dict[str, Any]:
        """Handle errors that occur before the debate engine starts streaming."""
        run_id = str(final_state.get("run_id", "") or "").strip()
        if not run_id:
            raise RuntimeError("Startup error cannot be finalized without a run_id.") from exc
        return await self._handle_debate_error(run_id, session_id, final_state, exc)
