"""
Debate runner — executes the LangGraph debate graph and streams
events to WebSocket clients in real-time.
Also persists state snapshots to the database after each node.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.api.websocket import manager as ws_manager
from app.db.database import get_session_factory
from app.services import session_service

logger = logging.getLogger(__name__)


# Node-to-phase mapping: Since stream_mode="updates" yields AFTER a node completes,
# we map the completed node to the user-friendly status of the *next* operation.
_NODE_STATUS = {
    "manage_context": ("正在整理上下文...", "preparing"),
    "set_speaker": ("切换发言人...", "preparing"),
    "speaker": ("辩手正在思考/发言...", "speaking"),
    "tool_executor": ("正在调取事实与验证...", "fact_checking"),
    "judge": ("裁判长考核评估中...", "judging"),
    "advance_turn": ("准备下一回合...", "context"),
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
    """
    from app.agents.graph import DebateGraphState, compile_debate_graph
    participants = participants or ["proposer", "opposer"]

    # Fetch existing session state to permit resumption
    factory = get_session_factory()
    async with factory() as db:
        session_db = await session_service.get_session(db, session_id)
        
    session_db = session_db or {}
    state_snap = session_db.get("state_snapshot") or {}

    logger.info(
        "Starting/Resuming debate: session=%s topic='%s' turns=%d",
        session_id, topic, max_turns,
    )

    # Build initial state from previous snapshot if available
    initial_state: DebateGraphState = {
        "session_id": session_id,
        "topic": topic,
        "participants": participants,
        "current_turn": session_db.get("current_turn", 0),
        "max_turns": max_turns,
        "current_speaker": "",
        "current_speaker_index": -1,
        "dialogue_history": state_snap.get("dialogue_history", []),
        "shared_knowledge": state_snap.get("shared_knowledge", []),
        "messages": [],
        "current_scores": state_snap.get("current_scores", {}),
        "cumulative_scores": state_snap.get("cumulative_scores", {}),
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
    await ws_manager.broadcast(session_id, {
        "type": "status",
        "content": "正在整理上下文...",
        "phase": "context",
        "node": "manage_context",
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
                            current_val = final_state.get(key)
                            if isinstance(current_val, list):
                                current_val.extend(value)
                            else:
                                final_state[key] = list(value)
                        elif key == "shared_knowledge" and isinstance(value, list):
                            current_val = final_state.get(key)
                            if isinstance(current_val, list):
                                # It's a full replacement for our simplified state tracker, or extension depending on graph reducer. 
                                # Actually `add` reducer means LangGraph appends it, but here we just replace it because 
                                # the LangGraph state is complete. Actually node_output might just be the delta.
                                # Let's just track the delta by extending.
                                current_val.extend(value)
                            else:
                                final_state[key] = list(value)
                        elif key == "messages" and isinstance(value, list):
                            final_state["messages"] = list(value)
                        else:
                            final_state[key] = value

                # Send specific events based on node type
                if node_name == "speaker":
                    history = final_state.get("dialogue_history", [])
                    msgs = final_state.get("messages", [])
                    # If messages is NOT empty and contains tool calling, wait.
                    # If it's empty, speech is done and pushed to history.
                    if not msgs and history:
                        latest = history[-1]
                        await ws_manager.broadcast(session_id, {
                            "type": "speech_end",
                            "role": latest.get("role", ""),
                            "content": latest.get("content", ""),
                            "citations": latest.get("citations", []),
                        })

                elif node_name == "tool_executor":
                    knowledge = final_state.get("shared_knowledge", [])
                    # Just broadcast the most recent additions or a generic tool pulse
                    # We broadcast the last fact if available
                    recent_facts = [k for k in knowledge if k.get("type") == "fact"]
                    if recent_facts:
                        await ws_manager.broadcast(session_id, {
                            "type": "fact_check_result",
                            "results": [recent_facts[-1]], # Broadcast the latest fact just grabbed
                            "count": len(knowledge),
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
        
        # Also inject an error message into dialogue history so frontends can render it easily
        import datetime
        dh = final_state.get("dialogue_history")
        if not isinstance(dh, list):
            dh = []
            final_state["dialogue_history"] = dh
            
        dh.append({
            "role": "error",
            "content": f"系统运行出错: {str(exc)}",
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
            "agent_name": "系统",
            "citations": []
        })
        
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
                    "shared_knowledge": state.get("shared_knowledge", []),
                    "current_scores": state.get("current_scores", {}),
                    "cumulative_scores": state.get("cumulative_scores", {}),
                    "agent_configs": state.get("agent_configs", {}),
                },
            )
    except Exception as exc:
        logger.error("Failed to persist state: %s", exc)
