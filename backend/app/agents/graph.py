"""
LangGraph debate state machine — the core orchestration graph.

Flow per turn (Dynamic Tool Calling):
  manage_context → set_speaker → debater_speak ↔ tool_executor
                                     ↓
                                advance_turn (loop until all speak)
                                     ↓
  (next turn or END)
"""

from __future__ import annotations

import logging
from operator import add
from typing import Annotated, Any, Sequence

from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langchain_core.messages import BaseMessage

from app.agents.debater import debater_speak
from app.agents.judge import judge_score
from app.agents.context_manager import compress_context
from app.agents.skills import get_all_skills

logger = logging.getLogger(__name__)


# ── LangGraph State Type ────────────────────────────────────────

from typing import TypedDict


class DebateGraphState(TypedDict, total=False):
    """State flowing through the LangGraph debate graph."""

    session_id: str
    topic: str
    participants: list[str]
    current_turn: int
    max_turns: int
    current_speaker: str
    current_speaker_index: int

    dialogue_history: Annotated[list[dict[str, Any]], add]
    shared_knowledge: list[dict[str, Any]]
    
    # Internal message passing for tool calling loop within a node execution
    messages: Annotated[list[BaseMessage], add_messages]

    current_scores: dict[str, Any]
    cumulative_scores: dict[str, Any]

    status: str
    error: str | None
    agent_configs: dict[str, dict[str, Any]]


# ── Node functions ──────────────────────────────────────────────

async def node_manage_context(state: DebateGraphState) -> dict[str, Any]:
    """Compress old dialogue history if it exceeds the context window."""
    history = state.get("dialogue_history", [])
    knowledge = state.get("shared_knowledge", [])

    # Convert history entries to plain dicts for processing
    history_dicts = [dict(e) if not isinstance(e, dict) else e for e in history]
    
    # We do not override dialogue_history directly via `add` reducer, so we just return the new shared_knowledge
    # The actual truncation happens magically, or we return what we added. 
    # Actually, to truncate history with an `add` reducer in LangGraph, you usually return empty if not replacing.
    # Since `add` appends, to truncate we technically shouldn't use `add` for history if we want to prune it.
    # But since we only read from `shared_knowledge` + `recent_history`, we can just append to `shared_knowledge`.
    # Let's fix this: `compress_context` returns updated knowledge.
    new_knowledge, _ = await compress_context(history_dicts, knowledge)

    return {
        "shared_knowledge": new_knowledge,
    }


async def node_set_speaker(state: DebateGraphState) -> dict[str, Any]:
    """Determine the next speaker in the sequence for this turn."""
    participants = state.get("participants", ["proposer", "opposer"])
    current_idx = state.get("current_speaker_index", -1)
    
    # Move to next participant. If -1, it goes to 0 (first participant).
    next_idx = current_idx + 1
    
    if next_idx >= len(participants):
        # All participants have spoken for this turn.
        # But we don't set speaker here if we're done, the edge will route to judge.
        return {}

    return {
        "current_speaker": participants[next_idx],
        "current_speaker_index": next_idx,
    }


async def node_debater_speak(state: DebateGraphState) -> dict[str, Any]:
    """Wrapper around debater_speak for the LangGraph node."""
    return await debater_speak(state)


async def node_tool_executor(state: DebateGraphState) -> dict[str, Any]:
    """Executes the tool called by the LLM and feeds it back into the messages list and shared_knowledge."""
    messages = state.get("messages", [])
    if not messages:
        return {}
        
    last_message = messages[-1]
    results = []
    knowledge_updates = []
    
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        skills = {s.name: s for s in get_all_skills()}
        for tool_call in last_message.tool_calls:
            logger.info("Executing Tool: %s", tool_call["name"])
            tool_fn = skills.get(tool_call["name"])
            if tool_fn:
                try:
                    result_content = await tool_fn.ainvoke(tool_call["args"])
                except Exception as exc:
                    result_content = f"Error: {exc}"
                    
                from langchain_core.messages import ToolMessage
                results.append(ToolMessage(
                    content=str(result_content), 
                    tool_call_id=tool_call["id"],
                    name=tool_call["name"]
                ))
                
                # Automatically save tool facts into shared memory
                if tool_call["name"] == "search_web":
                    knowledge_updates.append({
                        "type": "fact",
                        "query": tool_call["args"].get("query", ""),
                        "result": str(result_content)[:500] + "..." # Truncated
                    })
            
    return {
        "messages": results,
        "shared_knowledge": state.get("shared_knowledge", []) + knowledge_updates
    }


async def node_judge_score(state: DebateGraphState) -> dict[str, Any]:
    """Wrapper around judge_score for the LangGraph node."""
    return await judge_score(state)


async def node_advance_turn(state: DebateGraphState) -> dict[str, Any]:
    """Increment the turn counter and reset speaker index."""
    current = state.get("current_turn", 0)
    return {
        "current_turn": current + 1,
        "current_speaker_index": -1, # Reset for the next round
        "messages": [] # Clear internal tool messages
    }


# ── Conditional edges ───────────────────────────────────────────

def should_execute_tools(state: DebateGraphState) -> str:
    """Check if the debater emitted a tool call."""
    messages = state.get("messages", [])
    if messages:
        last_message = messages[-1]
        if hasattr(last_message, "tool_calls") and last_message.tool_calls:
            return "tools"
    
    # Determine what to do next based on speaker index
    participants = state.get("participants", ["proposer", "opposer"])
    current_idx = state.get("current_speaker_index", 0)
    
    if current_idx + 1 < len(participants):
        return "next_speaker"
    else:
        return "judge"

def should_continue(state: DebateGraphState) -> str:
    """After advancing turn, decide whether to continue or end."""
    current_turn = state.get("current_turn", 0)
    max_turns = state.get("max_turns", 5)

    if current_turn >= max_turns:
        logger.info("Debate complete: reached max turns (%d/%d)", current_turn, max_turns)
        return "end"
    else:
        logger.info("Continuing to turn %d/%d", current_turn + 1, max_turns)
        return "continue"


# ── Build the graph ─────────────────────────────────────────────

def build_debate_graph() -> StateGraph:
    """
    Construct the debate LangGraph.

    Graph flow (per turn):
      manage_context → set_speaker → debater_speaks ↔ tool_executor 
                       ↑                  ↓
                       └───── ← ──[next]──┘
                                          ↓ [judge]
                                        judge → advance_turn → {continue, end}
    """
    graph = StateGraph(DebateGraphState)

    # Add nodes
    graph.add_node("manage_context", node_manage_context)
    graph.add_node("set_speaker", node_set_speaker)
    graph.add_node("speaker", node_debater_speak)
    graph.add_node("tool_executor", node_tool_executor)
    graph.add_node("judge", node_judge_score)
    graph.add_node("advance_turn", node_advance_turn)

    # Define edges
    graph.set_entry_point("manage_context")
    graph.add_edge("manage_context", "set_speaker")
    graph.add_edge("set_speaker", "speaker")
    
    # From speaker, we check if they called a tool or are finished
    graph.add_conditional_edges(
        "speaker",
        should_execute_tools,
        {
            "tools": "tool_executor",
            "next_speaker": "set_speaker",
            "judge": "judge"
        }
    )
    
    # Tools feed back into the speaker to resolve the thought process
    graph.add_edge("tool_executor", "speaker")
    
    # Judge flows to advance turn
    graph.add_edge("judge", "advance_turn")

    # Conditional: continue to next turn or end
    graph.add_conditional_edges(
        "advance_turn",
        should_continue,
        {
            "continue": "manage_context",
            "end": END,
        },
    )

    return graph


def compile_debate_graph():
    """Build and compile the debate graph, ready for execution."""
    graph = build_debate_graph()
    return graph.compile()
