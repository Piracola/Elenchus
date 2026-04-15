"""Runtime orchestrator that coordinates persistence and event delivery."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

from app.runtime.engines import DebateEngine, LangGraphDebateEngine
from app.runtime.event_emitter import EventEmitter, RuntimeEventEmitter, noop_emit_event
from app.runtime.session_repository import SessionRuntimeRepository
from app.text_repair import format_runtime_error_message

if TYPE_CHECKING:
    from app.runtime.bus import RuntimeBus

logger = logging.getLogger(__name__)

_PERSIST_NODES = frozenset(
    {
        "advance_turn",
        "judge",
        "speaker",
        "team_discussion",
        "jury_discussion",
        "consensus",
        "sophistry_speaker",
        "sophistry_observer",
        "sophistry_postmortem",
    }
)


class DebateOrchestrator:
    """Coordinate a debate engine with persistence and outbound events."""

    def __init__(
        self,
        *,
        repository: SessionRuntimeRepository | None = None,
        engine: DebateEngine | None = None,
        runtime_bus: "RuntimeBus" | None = None,
        event_gateway: "RuntimeBus" | None = None,
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
        session_id: str,
        topic: str,
        participants: list[str] | None = None,
        max_turns: int = 5,
        agent_configs: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        final_state: dict[str, Any] = {
            "session_id": session_id,
            "topic": topic,
            "participants": participants or ["proposer", "opposer"],
            "max_turns": max_turns,
            "current_turn": 0,
            "current_speaker": "",
            "current_speaker_index": -1,
            "dialogue_history": [],
            "team_dialogue_history": [],
            "jury_dialogue_history": [],
            "judge_history": [],
            "recent_dialogue_history": [],
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
        initial_state["runtime_event_emitter"] = self._events
        initial_state["interrupted_at"] = None
        initial_state["last_progress_at"] = datetime.now(timezone.utc).isoformat()

        logger.info(
            "Starting/Resuming debate: session=%s topic='%s' turns=%d mode=%s",
            session_id,
            topic,
            max_turns,
            debate_mode,
        )

        if prior_resume_count > 0 or last_checkpoint_node:
            checkpoint_label = last_checkpoint_node or "manage_context"
            await self._events.emit_runtime_event(
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

        await self._events.emit_runtime_event(
            session_id=session_id,
            event_type="system",
            payload={"content": f"辩论开始：{topic}"},
            source="runtime.orchestrator",
        )
        if debate_mode == "sophistry_experiment":
            await self._events.emit_runtime_event(
                session_id=session_id,
                event_type="mode_notice",
                payload={
                    "content": (
                        "诡辩实验模式已启用：本场不会使用搜索、陪审团或裁判评分，"
                        "输出仅用于观察修辞操控与谬误对抗。"
                    )
                },
                source="runtime.orchestrator.mode",
                phase="processing",
            )
        await self._events.emit_runtime_event(
            session_id=session_id,
            event_type="status",
            payload={"content": "正在整理上下文...", "node": "manage_context"},
            source="runtime.orchestrator",
            phase="context",
        )

        final_state = dict(initial_state)
        prev_history_len = len(initial_state.get("dialogue_history", []))
        prev_team_history_len = len(initial_state.get("team_dialogue_history", []))
        prev_jury_history_len = len(initial_state.get("jury_dialogue_history", []))
        initial_knowledge = initial_state.get("shared_knowledge", [])
        prev_knowledge_len = len(initial_knowledge) if isinstance(initial_knowledge, list) else 0
        emitted_judge_keys: set[tuple[int, str]] = set()

        try:
            last_status_node = "manage_context"
            async for state_snapshot in self._engine.stream(initial_state):
                node_name = state_snapshot.get("last_executed_node", "")
                final_state = dict(state_snapshot)
                final_state["last_progress_at"] = datetime.now(timezone.utc).isoformat()
                prev_knowledge_len = await self._events.emit_memory_updates(
                    session_id,
                    final_state,
                    prev_knowledge_len,
                )

                if node_name and node_name != last_node:
                    last_node = node_name
                    status_message, _status_phase = self._events.describe_status(node_name)
                    final_state["last_status_message"] = status_message
                    last_status_node = await self._events.emit_status_if_changed(
                        session_id,
                        node_name,
                        last_status_node,
                    )

                    if node_name in {"speaker", "sophistry_speaker"}:
                        prev_history_len = await self._events.emit_speech(
                            session_id,
                            final_state,
                            prev_history_len,
                        )
                    elif node_name in {"sophistry_observer", "sophistry_postmortem"}:
                        prev_history_len = await self._events.emit_sophistry_reports(
                            session_id,
                            final_state,
                            prev_history_len,
                        )
                    elif node_name == "team_discussion":
                        prev_team_history_len = await self._events.emit_team_discussion(
                            session_id,
                            final_state,
                            prev_team_history_len,
                        )
                    elif node_name == "jury_discussion":
                        prev_jury_history_len = await self._events.emit_jury_discussion(
                            session_id,
                            final_state,
                            prev_jury_history_len,
                        )
                    elif node_name == "tool_executor":
                        await self._events.emit_fact_check(session_id, final_state)
                    elif node_name == "judge":
                        await self._events.emit_judge_scores(
                            session_id,
                            final_state,
                            emitted_judge_keys,
                        )
                    elif node_name == "advance_turn":
                        await self._events.emit_turn_complete(session_id, final_state)
                    elif node_name == "consensus":
                        prev_jury_history_len = await self._events.emit_jury_discussion(
                            session_id,
                            final_state,
                            prev_jury_history_len,
                        )

                    next_status_node = self._events.predict_next_status_node(
                        node_name,
                        final_state,
                    )
                    if next_status_node is not None:
                        last_status_node = await self._events.emit_status_if_changed(
                            session_id,
                            next_status_node,
                            last_status_node,
                        )

                if node_name in _PERSIST_NODES:
                    await self._repository.persist_state(session_id, final_state)

            final_state["status"] = "completed"
            final_state["interrupted_at"] = None
            final_state["last_status_message"] = "辩论已完成"
            final_state["last_progress_at"] = datetime.now(timezone.utc).isoformat()
            await self._repository.persist_state(session_id, final_state)
            await self._events.emit_runtime_event(
                session_id=session_id,
                event_type="debate_complete",
                payload={
                    "final_scores": final_state.get("cumulative_scores", {}),
                    "total_turns": final_state.get("current_turn", 0),
                    "final_report": final_state.get("final_mode_report"),
                },
                source="runtime.orchestrator",
            )

            logger.info(
                "Debate completed: session=%s turns=%d",
                session_id,
                final_state.get("current_turn", 0),
            )
        except asyncio.CancelledError:
            interrupted_at = datetime.now(timezone.utc).isoformat()
            final_state["status"] = "in_progress"
            final_state["interrupted_at"] = interrupted_at
            final_state["last_progress_at"] = interrupted_at
            if last_node:
                final_state["last_executed_node"] = last_node
            final_state["last_status_message"] = "辩论已中断，可稍后继续恢复。"
            await self._repository.persist_state(session_id, final_state)
            raise
        except Exception as exc:
            final_state = await self._handle_debate_error(
                session_id, final_state, exc, last_node=last_node
            )

        return final_state

    async def _handle_debate_error(
        self,
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
        state["interrupted_at"] = datetime.now(timezone.utc).isoformat()
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
                "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
                "agent_name": "系统",
                "citations": [],
            }
        )
        state["recent_dialogue_history"] = dialogue_history

        await self._repository.persist_state(session_id, state)
        await self._events.emit_runtime_event(
            session_id=session_id,
            event_type="error",
            payload={"content": f"辩论出错：{user_facing_error}"},
            source="runtime.orchestrator",
            phase="error",
        )
        return state

    async def _finalize_startup_error(
        self,
        session_id: str,
        final_state: dict[str, Any],
        exc: Exception,
    ) -> dict[str, Any]:
        """Handle errors that occur before the debate engine starts streaming."""
        return await self._handle_debate_error(session_id, final_state, exc)
