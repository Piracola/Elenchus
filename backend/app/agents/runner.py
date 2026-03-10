"""
Debate runner — executes the LangGraph debate graph and streams
events to WebSocket clients in real-time.
Also persists state snapshots to the database after each node.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.agents.graph import DebateGraphState, compile_debate_graph
from app.api.websocket import manager as ws_manager
from app.db.database import get_session_factory
from app.services import session_service

logger = logging.getLogger(__name__)


# Node-to-phase mapping for user-friendly status messages
_NODE_STATUS = {
    "manage_context": ("正在整理上下文...", "context"),
    "set_proposer": ("正方准备发言...", "preparing"),
    "proposer_speaks": ("正方正在发言...", "speaking"),
    "fact_check_proposer": ("正在核查正方论据...", "fact_checking"),
    "set_opposer": ("反方准备发言...", "preparing"),
    "opposer_speaks": ("反方正在发言...", "speaking"),
    "fact_check_opposer": ("正在核查反方论据...", "fact_checking"),
    "judge": ("裁判评分中...", "judging"),
    "advance_turn": ("回合结算中...", "advancing"),
}


async def run_debate(
    session_id: str,
    topic: str,
    participants: list[str] | None = None,
    max_turns: int = 5,
    agent_configs: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Execute a full debate and stream events via WebSocket.

    This function:
    1. Compiles the LangGraph debate graph
    2. Streams node-level events to WebSocket clients
    3. Persists state to DB after each significant node
    4. Returns the final state
    """
    participants = participants or ["proposer", "opposer"]

    logger.info(
        "Starting debate: session=%s topic='%s' turns=%d",
        session_id, topic, max_turns,
    )

    # Build initial state
    initial_state: DebateGraphState = {
        "session_id": session_id,
        "topic": topic,
        "participants": participants,
        "current_turn": 0,
        "max_turns": max_turns,
        "current_speaker": "",
        "current_speaker_index": 0,
        "dialogue_history": [],
        "context_summary": "",
        "search_context": [],
        "current_scores": {},
        "cumulative_scores": {},
        "status": "in_progress",
        "error": None,
        "agent_configs": agent_configs or {},
    }

    # Compile the graph
    app = compile_debate_graph()

    # Notify clients
    await ws_manager.broadcast(session_id, {
        "type": "system",
        "content": f"辩论开始: {topic}",
    })

    final_state = dict(initial_state)

    try:
        # Stream through the graph node-by-node
        async for event in app.astream(initial_state, stream_mode="updates"):
            for node_name, node_output in event.items():
                # Send status update
                status_msg, phase = _NODE_STATUS.get(
                    node_name, (f"处理中: {node_name}", "processing")
                )
                await ws_manager.broadcast(session_id, {
                    "type": "status",
                    "content": status_msg,
                    "phase": phase,
                    "node": node_name,
                })

                # Merge node output into our tracking state
                if isinstance(node_output, dict):
                    for key, value in node_output.items():
                        if key == "dialogue_history" and isinstance(value, list):
                            # Accumulate dialogue entries
                            final_state.setdefault("dialogue_history", []).extend(value)
                        else:
                            final_state[key] = value

                # Send specific events based on node type
                if node_name in ("proposer_speaks", "opposer_speaks"):
                    history = final_state.get("dialogue_history", [])
                    if history:
                        latest = history[-1]
                        await ws_manager.broadcast(session_id, {
                            "type": "speech_end",
                            "role": latest.get("role", ""),
                            "content": latest.get("content", ""),
                            "citations": latest.get("citations", []),
                        })

                elif node_name in ("fact_check_proposer", "fact_check_opposer"):
                    search_ctx = final_state.get("search_context", [])
                    await ws_manager.broadcast(session_id, {
                        "type": "fact_check_result",
                        "results": search_ctx,
                        "count": len(search_ctx),
                    })

                elif node_name == "judge":
                    scores = final_state.get("current_scores", {})
                    for role, score_data in scores.items():
                        await ws_manager.broadcast(session_id, {
                            "type": "judge_score",
                            "role": role,
                            "scores": score_data,
                        })

                elif node_name == "advance_turn":
                    turn = final_state.get("current_turn", 0)
                    await ws_manager.broadcast(session_id, {
                        "type": "turn_complete",
                        "turn": turn,
                        "current_scores": final_state.get("current_scores", {}),
                        "cumulative_scores": final_state.get("cumulative_scores", {}),
                    })

            # Persist state snapshot after each event batch
            await _persist_state(session_id, final_state)

        # Debate completed successfully
        final_state["status"] = "completed"
        await _persist_state(session_id, final_state)

        await ws_manager.broadcast(session_id, {
            "type": "debate_complete",
            "final_scores": final_state.get("cumulative_scores", {}),
            "total_turns": final_state.get("current_turn", 0),
        })

        logger.info("Debate completed: session=%s turns=%d", session_id, final_state.get("current_turn", 0))

    except Exception as exc:
        logger.error("Debate failed: session=%s error=%s", session_id, exc, exc_info=True)
        final_state["status"] = "error"
        final_state["error"] = str(exc)
        await _persist_state(session_id, final_state)

        await ws_manager.broadcast(session_id, {
            "type": "error",
            "content": f"辩论出错: {exc}",
        })

    return final_state


async def _persist_state(session_id: str, state: dict[str, Any]) -> None:
    """Save the current graph state to the database."""
    try:
        factory = get_session_factory()
        async with factory() as db:
            await session_service.update_session_state(
                db,
                session_id,
                current_turn=state.get("current_turn", 0),
                status=state.get("status", "in_progress"),
                state_snapshot={
                    "dialogue_history": state.get("dialogue_history", []),
                    "current_scores": state.get("current_scores", {}),
                    "cumulative_scores": state.get("cumulative_scores", {}),
                    "search_context": state.get("search_context", []),
                    "context_summary": state.get("context_summary", ""),
                    "agent_configs": state.get("agent_configs", {}),
                },
            )
    except Exception as exc:
        logger.error("Failed to persist state: %s", exc)
