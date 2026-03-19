"""Runtime orchestrator that coordinates persistence and event delivery."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

from app.runtime.engines import DebateEngine, LangGraphDebateEngine
from app.runtime.event_emitter import EventEmitter, RuntimeEventEmitter, noop_emit_event
from app.runtime.session_repository import SessionRuntimeRepository

if TYPE_CHECKING:
    from app.runtime.bus import RuntimeBus

logger = logging.getLogger(__name__)

_PERSIST_NODES = frozenset(
    {"advance_turn", "judge", "speaker", "team_discussion", "jury_discussion", "consensus"}
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

        await self._events.emit_runtime_event(
            session_id=session_id,
            event_type="system",
            payload={"content": f"杈╄寮€濮? {topic}"},
            source="runtime.orchestrator",
        )
        await self._events.emit_runtime_event(
            session_id=session_id,
            event_type="status",
            payload={"content": "姝ｅ湪鏁寸悊涓婁笅鏂?..", "node": "manage_context"},
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
            last_node = ""
            last_status_node = "manage_context"
            async for state_snapshot in self._engine.stream(initial_state):
                node_name = state_snapshot.get("last_executed_node", "")
                final_state = dict(state_snapshot)
                prev_knowledge_len = await self._events.emit_memory_updates(
                    session_id,
                    final_state,
                    prev_knowledge_len,
                )

                if node_name and node_name != last_node:
                    last_node = node_name
                    last_status_node = await self._events.emit_status_if_changed(
                        session_id,
                        node_name,
                        last_status_node,
                    )

                    if node_name == "speaker":
                        prev_history_len = await self._events.emit_speech(
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
            await self._repository.persist_state(session_id, final_state)
            await self._events.emit_runtime_event(
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
                    "content": f"绯荤粺杩愯鍑洪敊: {str(exc)}",
                    "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
                    "agent_name": "绯荤粺",
                    "citations": [],
                }
            )
            final_state["recent_dialogue_history"] = dialogue_history

            await self._repository.persist_state(session_id, final_state)
            await self._events.emit_runtime_event(
                session_id=session_id,
                event_type="error",
                payload={"content": f"杈╄鍑洪敊: {exc}"},
                source="runtime.orchestrator",
                phase="error",
            )

        return final_state
