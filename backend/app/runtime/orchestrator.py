"""Runtime orchestrator that coordinates persistence and event delivery."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

from app.runtime.engines import DebateEngine, LangGraphDebateEngine
from app.runtime.session_repository import SessionRuntimeRepository

if TYPE_CHECKING:
    from app.runtime.event_gateway import EventStreamGateway

logger = logging.getLogger(__name__)

EventEmitter = Callable[[str, dict[str, Any]], Awaitable[None]]

_NODE_STATUS = {
    "manage_context": ("正在整理上下文...", "preparing"),
    "set_speaker": ("切换发言人...", "preparing"),
    "speaker": ("辩手正在思考/发言...", "speaking"),
    "tool_executor": ("正在调取事实与验证...", "fact_checking"),
    "judge": ("裁判长考核评估中...", "judging"),
    "advance_turn": ("准备下一回合...", "context"),
}

_PERSIST_NODES = frozenset({"advance_turn", "judge", "speaker"})


async def _noop_emit_event(session_id: str, message: dict[str, Any]) -> None:
    """Fallback emitter for scripts/tests that do not attach a transport."""
    return None


def _has_pending_tool_calls(state: dict[str, Any]) -> bool:
    messages = state.get("messages", [])
    if not isinstance(messages, list) or not messages:
        return False

    last_message = messages[-1]
    tool_calls = getattr(last_message, "tool_calls", None)
    return bool(tool_calls)


class DebateOrchestrator:
    """Coordinate a debate engine with persistence and outbound events."""

    def __init__(
        self,
        *,
        repository: SessionRuntimeRepository | None = None,
        engine: DebateEngine | None = None,
        event_gateway: "EventStreamGateway" | None = None,
        emit_event: EventEmitter = _noop_emit_event,
    ) -> None:
        self._repository = repository or SessionRuntimeRepository()
        self._engine = engine or LangGraphDebateEngine()
        self._event_gateway = event_gateway
        self._emit_event = emit_event

    async def run_debate(
        self,
        session_id: str,
        topic: str,
        participants: list[str] | None = None,
        max_turns: int = 5,
        agent_configs: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        initial_state = await self._repository.build_initial_state(
            session_id,
            topic=topic,
            participants=participants,
            max_turns=max_turns,
            agent_configs=agent_configs,
        )
        if initial_state is None:
            raise ValueError(f"Session {session_id} was not found.")

        logger.info(
            "Starting/Resuming debate: session=%s topic='%s' turns=%d",
            session_id,
            topic,
            max_turns,
        )

        await self._emit_runtime_event(
            session_id=session_id,
            event_type="system",
            payload={"content": f"辩论开始: {topic}"},
            source="runtime.orchestrator",
        )
        await self._emit_runtime_event(
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

        try:
            last_node = ""
            last_status_node = "manage_context"
            async for state_snapshot in self._engine.stream(initial_state):
                node_name = state_snapshot.get("last_executed_node", "")
                final_state = dict(state_snapshot)
                prev_knowledge_len = await self._emit_memory_updates(
                    session_id,
                    final_state,
                    prev_knowledge_len,
                )

                if node_name and node_name != last_node:
                    last_node = node_name
                    last_status_node = await self._emit_status_if_changed(
                        session_id,
                        node_name,
                        last_status_node,
                    )

                    if node_name == "speaker":
                        prev_history_len = await self._emit_speech(
                            session_id,
                            final_state,
                            prev_history_len,
                        )
                    elif node_name == "tool_executor":
                        await self._emit_fact_check(session_id, final_state)
                    elif node_name == "judge":
                        await self._emit_judge_scores(
                            session_id,
                            final_state,
                            emitted_judge_keys,
                        )
                    elif node_name == "advance_turn":
                        await self._emit_turn_complete(session_id, final_state)

                    next_status_node = self._predict_next_status_node(node_name, final_state)
                    if next_status_node is not None:
                        last_status_node = await self._emit_status_if_changed(
                            session_id,
                            next_status_node,
                            last_status_node,
                        )

                if node_name in _PERSIST_NODES:
                    await self._repository.persist_state(session_id, final_state)

            final_state["status"] = "completed"
            await self._repository.persist_state(session_id, final_state)
            await self._emit_runtime_event(
                session_id=session_id,
                event_type="debate_complete",
                payload={
                    "final_scores": final_state.get("cumulative_scores", {}),
                    "total_turns": final_state.get("current_turn", 0),
                },
                source="runtime.orchestrator",
            )

            logger.info(
                "Debate completed: session=%s turns=%d",
                session_id,
                final_state.get("current_turn", 0),
            )
        except Exception as exc:
            logger.error(
                "Debate failed: session=%s error=%s",
                session_id,
                exc,
                exc_info=True,
            )
            final_state["status"] = "error"
            final_state["error"] = str(exc)

            dialogue_history = final_state.get("dialogue_history")
            if not isinstance(dialogue_history, list):
                dialogue_history = []
                final_state["dialogue_history"] = dialogue_history

            dialogue_history.append(
                {
                    "role": "error",
                    "content": f"系统运行出错: {str(exc)}",
                    "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
                    "agent_name": "系统",
                    "citations": [],
                }
            )
            final_state["recent_dialogue_history"] = dialogue_history

            await self._repository.persist_state(session_id, final_state)
            await self._emit_runtime_event(
                session_id=session_id,
                event_type="error",
                payload={"content": f"辩论出错: {exc}"},
                source="runtime.orchestrator",
                phase="error",
            )

        return final_state

    async def _emit_runtime_event(
        self,
        *,
        session_id: str,
        event_type: str,
        payload: dict[str, Any] | None = None,
        source: str = "runtime.orchestrator",
        phase: str | None = None,
    ) -> None:
        if self._event_gateway is not None:
            await self._event_gateway.emit(
                session_id=session_id,
                event_type=event_type,
                payload=payload,
                source=source,
                phase=phase,
            )
            return

        fallback_message = {"type": event_type, **(payload or {})}
        if phase:
            fallback_message["phase"] = phase
        await self._emit_event(session_id, fallback_message)

    async def _emit_status(self, session_id: str, node_name: str) -> None:
        status_msg, phase = _NODE_STATUS.get(
            node_name,
            (f"处理中: {node_name}", "processing"),
        )
        await self._emit_runtime_event(
            session_id=session_id,
            event_type="status",
            payload={"content": status_msg, "node": node_name},
            phase=phase,
            source=f"runtime.node.{node_name}",
        )

    async def _emit_status_if_changed(
        self,
        session_id: str,
        node_name: str,
        last_status_node: str,
    ) -> str:
        if not node_name or node_name == last_status_node:
            return last_status_node

        await self._emit_status(session_id, node_name)
        return node_name

    def _predict_next_status_node(
        self,
        node_name: str,
        final_state: dict[str, Any],
    ) -> str | None:
        if node_name == "set_speaker":
            current_speaker = final_state.get("current_speaker")
            if isinstance(current_speaker, str) and current_speaker:
                return "speaker"
            return None

        if node_name == "speaker":
            if _has_pending_tool_calls(final_state):
                return "tool_executor"

            participants = final_state.get("participants", ["proposer", "opposer"])
            current_idx = final_state.get("current_speaker_index", 0)
            if isinstance(participants, list) and current_idx + 1 >= len(participants):
                return "judge"
            return None

        if node_name == "tool_executor":
            return "speaker"

        if node_name == "advance_turn":
            current_turn = final_state.get("current_turn", 0)
            max_turns = final_state.get("max_turns", 5)
            if isinstance(current_turn, int) and isinstance(max_turns, int) and current_turn < max_turns:
                return "manage_context"
            return None

        return None

    async def _emit_speech(
        self,
        session_id: str,
        final_state: dict[str, Any],
        prev_history_len: int,
    ) -> int:
        history = final_state.get("dialogue_history", [])
        curr_history_len = len(history)
        if curr_history_len <= prev_history_len or not history:
            return prev_history_len

        latest = history[-1]
        await self._emit_runtime_event(
            session_id=session_id,
            event_type="speech_start",
            payload={
                "role": latest.get("role", ""),
                "agent_name": latest.get("agent_name", ""),
            },
            source="runtime.node.speaker",
            phase="speaking",
        )
        await self._emit_runtime_event(
            session_id=session_id,
            event_type="speech_end",
            payload={
                "role": latest.get("role", ""),
                "agent_name": latest.get("agent_name", ""),
                "content": latest.get("content", ""),
                "citations": latest.get("citations", []),
            },
            source="runtime.node.speaker",
            phase="speaking",
        )
        return curr_history_len

    async def _emit_fact_check(self, session_id: str, final_state: dict[str, Any]) -> None:
        knowledge = final_state.get("shared_knowledge", [])
        recent_facts = [item for item in knowledge if item.get("type") == "fact"]
        if recent_facts:
            await self._emit_runtime_event(
                session_id=session_id,
                event_type="fact_check_result",
                payload={
                    "results": [recent_facts[-1]],
                    "count": len(knowledge),
                },
                source="runtime.node.tool_executor",
                phase="fact_checking",
            )

    async def _emit_judge_scores(
        self,
        session_id: str,
        final_state: dict[str, Any],
        emitted_judge_keys: set[tuple[int, str]],
    ) -> None:
        scores = final_state.get("current_scores", {})
        turn = int(final_state.get("current_turn", 0))
        for role, score_data in scores.items():
            dedupe_key = (turn, role)
            if dedupe_key in emitted_judge_keys:
                continue

            await self._emit_runtime_event(
                session_id=session_id,
                event_type="judge_score",
                payload={
                    "role": role,
                    "scores": score_data,
                    "turn": turn,
                },
                source="runtime.node.judge",
                phase="judging",
            )
            emitted_judge_keys.add(dedupe_key)

    async def _emit_turn_complete(self, session_id: str, final_state: dict[str, Any]) -> None:
        await self._emit_runtime_event(
            session_id=session_id,
            event_type="turn_complete",
            payload={
                "turn": final_state.get("current_turn", 0),
                "current_scores": final_state.get("current_scores", {}),
                "cumulative_scores": final_state.get("cumulative_scores", {}),
            },
            source="runtime.node.advance_turn",
            phase="context",
        )

    async def _emit_memory_updates(
        self,
        session_id: str,
        final_state: dict[str, Any],
        previous_count: int,
    ) -> int:
        knowledge = final_state.get("shared_knowledge", [])
        if not isinstance(knowledge, list):
            return previous_count

        total_count = len(knowledge)
        if total_count <= 0:
            return 0
        if total_count <= previous_count:
            return total_count

        new_items = knowledge[previous_count:total_count]
        for index, item in enumerate(new_items, start=previous_count):
            if not isinstance(item, dict):
                continue

            memory_type = str(item.get("type", "memo"))
            source = "runtime.memory"
            phase = "context"
            if memory_type == "fact":
                source = "runtime.node.tool_executor"
                phase = "fact_checking"
            elif memory_type in {"memo", "context"}:
                source = "runtime.node.manage_context"

            await self._emit_runtime_event(
                session_id=session_id,
                event_type="memory_write",
                payload={
                    "memory_type": memory_type,
                    "memory": item,
                    "memory_index": index,
                    "total_memories": total_count,
                },
                source=source,
                phase=phase,
            )

        return total_count
