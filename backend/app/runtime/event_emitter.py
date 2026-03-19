"""Runtime event emission helpers for debate orchestration."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.runtime.bus import RuntimeBus

EventEmitter = Callable[[str, dict[str, Any]], Awaitable[None]]

_NODE_STATUS = {
    "manage_context": ("正在整理上下文...", "preparing"),
    "set_speaker": ("正在切换发言方...", "preparing"),
    "team_discussion": ("组内讨论正在展开...", "preparing"),
    "jury_discussion": ("多视角陪审团正在讨论本轮表现...", "preparing"),
    "speaker": ("辩手正在思考并组织发言...", "speaking"),
    "tool_executor": ("正在调用工具核验事实...", "fact_checking"),
    "judge": ("裁判正在评估本轮表现...", "judging"),
    "advance_turn": ("准备进入下一回合...", "context"),
    "consensus": ("正在生成最终共识收敛总结...", "complete"),
}


async def noop_emit_event(session_id: str, message: dict[str, Any]) -> None:
    """Fallback emitter for scripts/tests that do not attach a transport."""
    return None


def _has_pending_tool_calls(state: dict[str, Any]) -> bool:
    messages = state.get("messages", [])
    if not isinstance(messages, list) or not messages:
        return False

    last_message = messages[-1]
    tool_calls = getattr(last_message, "tool_calls", None)
    return bool(tool_calls)


class RuntimeEventEmitter:
    """Encapsulate runtime event emission and status prediction rules."""

    def __init__(
        self,
        *,
        runtime_bus: "RuntimeBus" | None = None,
        emit_event: EventEmitter = noop_emit_event,
    ) -> None:
        self._runtime_bus = runtime_bus
        self._emit_event = emit_event

    async def emit_runtime_event(
        self,
        *,
        session_id: str,
        event_type: str,
        payload: dict[str, Any] | None = None,
        source: str = "runtime.orchestrator",
        phase: str | None = None,
    ) -> None:
        if self._runtime_bus is not None:
            await self._runtime_bus.emit(
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

    async def emit_status(self, session_id: str, node_name: str) -> None:
        status_msg, phase = _NODE_STATUS.get(
            node_name,
            (f"处理中: {node_name}", "processing"),
        )
        await self.emit_runtime_event(
            session_id=session_id,
            event_type="status",
            payload={"content": status_msg, "node": node_name},
            phase=phase,
            source=f"runtime.node.{node_name}",
        )

    async def emit_status_if_changed(
        self,
        session_id: str,
        node_name: str,
        last_status_node: str,
    ) -> str:
        if not node_name or node_name == last_status_node:
            return last_status_node

        await self.emit_status(session_id, node_name)
        return node_name

    def predict_next_status_node(
        self,
        node_name: str,
        final_state: dict[str, Any],
    ) -> str | None:
        if node_name == "set_speaker":
            current_speaker = final_state.get("current_speaker")
            if isinstance(current_speaker, str) and current_speaker:
                team_config = final_state.get("team_config", {})
                agents_per_team = int(team_config.get("agents_per_team", 0) or 0)
                discussion_rounds = int(team_config.get("discussion_rounds", 0) or 0)
                if agents_per_team > 0 and discussion_rounds > 0:
                    return "team_discussion"
                return "speaker"
            return None

        if node_name == "team_discussion":
            return "speaker"

        if node_name == "jury_discussion":
            return "judge"

        if node_name == "speaker":
            if _has_pending_tool_calls(final_state):
                return "tool_executor"

            participants = final_state.get("participants", ["proposer", "opposer"])
            current_idx = final_state.get("current_speaker_index", 0)
            if isinstance(participants, list) and current_idx + 1 >= len(participants):
                jury_config = final_state.get("jury_config", {})
                agents_per_jury = int(jury_config.get("agents_per_jury", 0) or 0)
                discussion_rounds = int(jury_config.get("discussion_rounds", 0) or 0)
                if agents_per_jury > 0 and discussion_rounds > 0:
                    return "jury_discussion"
                return "judge"
            return None

        if node_name == "tool_executor":
            return "speaker"

        if node_name == "advance_turn":
            current_turn = final_state.get("current_turn", 0)
            max_turns = final_state.get("max_turns", 5)
            reasoning_config = final_state.get("reasoning_config", {})
            if (
                isinstance(current_turn, int)
                and isinstance(max_turns, int)
                and current_turn < max_turns
            ):
                return "manage_context"
            if bool(reasoning_config.get("consensus_enabled", True)):
                return "consensus"
            return None

        return None

    async def emit_speech(
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
        await self.emit_runtime_event(
            session_id=session_id,
            event_type="speech_start",
            payload={
                "role": latest.get("role", ""),
                "agent_name": latest.get("agent_name", ""),
                "turn": latest.get("turn"),
            },
            source="runtime.node.speaker",
            phase="speaking",
        )
        await self.emit_runtime_event(
            session_id=session_id,
            event_type="speech_end",
            payload={
                "role": latest.get("role", ""),
                "agent_name": latest.get("agent_name", ""),
                "content": latest.get("content", ""),
                "citations": latest.get("citations", []),
                "turn": latest.get("turn"),
            },
            source="runtime.node.speaker",
            phase="speaking",
        )
        return curr_history_len

    async def emit_team_discussion(
        self,
        session_id: str,
        final_state: dict[str, Any],
        prev_history_len: int,
    ) -> int:
        history = final_state.get("team_dialogue_history", [])
        curr_history_len = len(history)
        if curr_history_len <= prev_history_len or not history:
            return prev_history_len

        new_entries = history[prev_history_len:curr_history_len]
        for entry in new_entries:
            if not isinstance(entry, dict):
                continue

            event_type = "team_summary" if entry.get("role") == "team_summary" else "team_discussion"
            await self.emit_runtime_event(
                session_id=session_id,
                event_type=event_type,
                payload={
                    "role": entry.get("role", ""),
                    "agent_name": entry.get("agent_name", ""),
                    "content": entry.get("content", ""),
                    "citations": entry.get("citations", []),
                    "turn": entry.get("turn"),
                    "discussion_kind": entry.get("discussion_kind", "team"),
                    "team_side": entry.get("team_side", ""),
                    "team_round": entry.get("team_round"),
                    "team_member_index": entry.get("team_member_index"),
                    "team_specialty": entry.get("team_specialty", ""),
                    "source_role": entry.get("source_role", ""),
                },
                source="runtime.node.team_discussion",
                phase="preparing",
            )

        return curr_history_len

    async def emit_jury_discussion(
        self,
        session_id: str,
        final_state: dict[str, Any],
        prev_history_len: int,
    ) -> int:
        history = final_state.get("jury_dialogue_history", [])
        curr_history_len = len(history)
        if curr_history_len <= prev_history_len or not history:
            return prev_history_len

        new_entries = history[prev_history_len:curr_history_len]
        for entry in new_entries:
            if not isinstance(entry, dict):
                continue

            role = entry.get("role")
            if role == "jury_summary":
                event_type = "jury_summary"
            elif role == "consensus_summary":
                event_type = "consensus_summary"
            else:
                event_type = "jury_discussion"
            source = "runtime.node.consensus" if role == "consensus_summary" else "runtime.node.jury_discussion"
            phase = "complete" if role == "consensus_summary" else "preparing"

            await self.emit_runtime_event(
                session_id=session_id,
                event_type=event_type,
                payload={
                    "role": role or "",
                    "agent_name": entry.get("agent_name", ""),
                    "content": entry.get("content", ""),
                    "citations": entry.get("citations", []),
                    "turn": entry.get("turn"),
                    "discussion_kind": entry.get("discussion_kind", "jury"),
                    "jury_round": entry.get("jury_round"),
                    "jury_member_index": entry.get("jury_member_index"),
                    "jury_perspective": entry.get("jury_perspective", ""),
                },
                source=source,
                phase=phase,
            )

        return curr_history_len

    async def emit_fact_check(self, session_id: str, final_state: dict[str, Any]) -> None:
        knowledge = final_state.get("shared_knowledge", [])
        recent_facts = [item for item in knowledge if item.get("type") == "fact"]
        if recent_facts:
            await self.emit_runtime_event(
                session_id=session_id,
                event_type="fact_check_result",
                payload={
                    "results": [recent_facts[-1]],
                    "count": len(knowledge),
                },
                source="runtime.node.tool_executor",
                phase="fact_checking",
            )

    async def emit_judge_scores(
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

            await self.emit_runtime_event(
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

    async def emit_turn_complete(self, session_id: str, final_state: dict[str, Any]) -> None:
        await self.emit_runtime_event(
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

    async def emit_memory_updates(
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

            await self.emit_runtime_event(
                session_id=session_id,
                event_type="memory_write",
                payload={
                    "memory_type": memory_type,
                    "memory": item,
                    "memory_index": index,
                    "total_memories": total_count,
                    "source_kind": item.get("source_kind"),
                    "source_timestamp": item.get("source_timestamp"),
                    "source_role": item.get("source_role") or item.get("role"),
                    "source_agent_name": item.get("source_agent_name") or item.get("agent_name"),
                    "source_excerpt": item.get("source_excerpt"),
                    "source_turn": item.get("source_turn"),
                },
                source=source,
                phase=phase,
            )

        return total_count
