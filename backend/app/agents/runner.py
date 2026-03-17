"""
Debate runner — executes the LangGraph debate graph and streams
events to WebSocket clients in real-time.
Also persists state snapshots to the database after each node.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from app.agents.events import broadcast_event
from app.db.database import get_session_factory
from app.services import session_service

logger = logging.getLogger(__name__)


_NODE_STATUS = {
    "manage_context": ("正在整理上下文...", "preparing"),
    "set_speaker": ("切换发言人...", "preparing"),
    "speaker": ("辩手正在思考/发言...", "speaking"),
    "tool_executor": ("正在调取事实与验证...", "fact_checking"),
    "judge": ("裁判长考核评估中...", "judging"),
    "advance_turn": ("准备下一回合...", "context"),
}

_PERSIST_NODES = frozenset({"advance_turn", "judge", "speaker"})


async def run_debate(
    session_id: str,
    topic: str,
    participants: list[str] | None = None,
    max_turns: int = 5,
    agent_configs: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Execute a full debate and stream events via WebSocket.
    """
    from app.agents.graph import DebateGraphState, compile_debate_graph
    participants = participants or ["proposer", "opposer"]

    factory = get_session_factory()
    async with factory() as db:
        session_db = await session_service.get_session(db, session_id)
        
    session_db = session_db or {}

    logger.info(
        "Starting/Resuming debate: session=%s topic='%s' turns=%d",
        session_id, topic, max_turns,
    )

    initial_state: DebateGraphState = {
        "session_id": session_id,
        "topic": topic,
        "participants": participants,
        "current_turn": session_db.get("current_turn", 0),
        "max_turns": max_turns,
        "current_speaker": "",
        "current_speaker_index": -1,
        "dialogue_history": session_db.get("dialogue_history", []),
        "shared_knowledge": session_db.get("shared_knowledge", []),
        "messages": [],
        "current_scores": session_db.get("current_scores", {}),
        "cumulative_scores": session_db.get("cumulative_scores", {}),
        "status": "in_progress",
        "error": None,
        "agent_configs": agent_configs or {},
    }

    app = compile_debate_graph()

    await broadcast_event(session_id, {
        "type": "system",
        "content": f"辩论开始: {topic}",
    })
    await broadcast_event(session_id, {
        "type": "status",
        "content": "正在整理上下文...",
        "phase": "context",
        "node": "manage_context",
    })

    final_state = dict(initial_state)
    prev_history_len = len(initial_state.get("dialogue_history", []))
    # Track already-broadcasted judge scores to prevent duplicates
    last_broadcasted_scores: dict[str, Any] = {}

    try:
        last_node = ""
        async for state_snapshot in app.astream(initial_state, stream_mode="values"):
            node_name = state_snapshot.get("last_executed_node", "")
            final_state = dict(state_snapshot)

            if node_name and node_name != last_node:
                last_node = node_name
                status_msg, phase = _NODE_STATUS.get(
                    node_name, (f"处理中: {node_name}", "processing")
                )
                await broadcast_event(session_id, {
                    "type": "status",
                    "content": status_msg,
                    "phase": phase,
                    "node": node_name,
                })

                if node_name == "speaker":
                    history = final_state.get("dialogue_history", [])
                    curr_history_len = len(history)
                    if curr_history_len > prev_history_len and history:
                        latest = history[-1]
                        await broadcast_event(session_id, {
                            "type": "speech_start",
                            "role": latest.get("role", ""),
                            "agent_name": latest.get("agent_name", ""),
                        })
                        await broadcast_event(session_id, {
                            "type": "speech_end",
                            "role": latest.get("role", ""),
                            "agent_name": latest.get("agent_name", ""),
                            "content": latest.get("content", ""),
                            "citations": latest.get("citations", []),
                        })
                        prev_history_len = curr_history_len

                elif node_name == "tool_executor":
                    knowledge = final_state.get("shared_knowledge", [])
                    recent_facts = [k for k in knowledge if k.get("type") == "fact"]
                    if recent_facts:
                        await broadcast_event(session_id, {
                            "type": "fact_check_result",
                            "results": [recent_facts[-1]],
                            "count": len(knowledge),
                        })

                elif node_name == "judge":
                    scores = final_state.get("current_scores", {})
                    # Only broadcast scores that haven't been broadcasted yet
                    for role, score_data in scores.items():
                        if role not in last_broadcasted_scores or last_broadcasted_scores.get(role) != score_data:
                            await broadcast_event(session_id, {
                                "type": "judge_score",
                                "role": role,
                                "scores": score_data,
                            })
                            last_broadcasted_scores[role] = score_data

                elif node_name == "advance_turn":
                    turn = final_state.get("current_turn", 0)
                    await broadcast_event(session_id, {
                        "type": "turn_complete",
                        "turn": turn,
                        "current_scores": final_state.get("current_scores", {}),
                        "cumulative_scores": final_state.get("cumulative_scores", {}),
                    })

            if node_name in _PERSIST_NODES:
                await _persist_state(session_id, final_state)

        final_state["status"] = "completed"
        await _persist_state(session_id, final_state)

        await broadcast_event(session_id, {
            "type": "debate_complete",
            "final_scores": final_state.get("cumulative_scores", {}),
            "total_turns": final_state.get("current_turn", 0),
        })

        logger.info("Debate completed: session=%s turns=%d", session_id, final_state.get("current_turn", 0))

    except Exception as exc:
        logger.error("Debate failed: session=%s error=%s", session_id, exc, exc_info=True)
        final_state["status"] = "error"
        final_state["error"] = str(exc)
        
        dh = final_state.get("dialogue_history")
        if not isinstance(dh, list):
            dh = []
            final_state["dialogue_history"] = dh

        dh.append({
            "role": "error",
            "content": f"系统运行出错: {str(exc)}",
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
            "agent_name": "系统",
            "citations": []
        })
        
        await _persist_state(session_id, final_state)

        await broadcast_event(session_id, {
            "type": "error",
            "content": f"辩论出错: {exc}",
        })

    return final_state


async def _persist_state(session_id: str, state: dict[str, Any]) -> None:
    """Save the current graph state to the database."""
    try:
        agent_configs = state.get("agent_configs", {})
        agent_configs_for_storage = {
            role: {k: v for k, v in cfg.items() if k != "api_key"}
            for role, cfg in agent_configs.items()
        }
        factory = get_session_factory()
        async with factory() as db:
            await session_service.update_session_state(
                db,
                session_id,
                current_turn=state.get("current_turn", 0),
                status=state.get("status", "in_progress"),
                state_snapshot={
                    "dialogue_history": state.get("dialogue_history", []),
                    "shared_knowledge": state.get("shared_knowledge", []),
                    "current_scores": state.get("current_scores", {}),
                    "cumulative_scores": state.get("cumulative_scores", {}),
                    "agent_configs": agent_configs_for_storage,
                },
            )
    except Exception as exc:
        logger.error("Failed to persist state: %s", exc)
