"""
LangGraph debate state machine — the core orchestration graph.

Flow per turn:
  manage_context → proposer_speak → fact_check →
  opposer_speak → fact_check → judge_score → advance_turn
                                               ↓
                                  (next turn or END)
"""

from __future__ import annotations

import logging
from operator import add
from typing import Annotated, Any

from langgraph.graph import END, StateGraph

from app.agents.debater import debater_speak
from app.agents.fact_checker import fact_check
from app.agents.judge import judge_score
from app.agents.context_manager import compress_context

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

    # dialogue_history uses `add` reducer → nodes return [new_entry]
    # and LangGraph appends it to the existing list
    dialogue_history: Annotated[list[dict[str, Any]], add]

    context_summary: str
    search_context: list[dict[str, Any]]

    current_scores: dict[str, Any]
    cumulative_scores: dict[str, Any]

    status: str
    error: str | None
    agent_configs: dict[str, dict[str, Any]]


# ── Node functions ──────────────────────────────────────────────

async def node_manage_context(state: DebateGraphState) -> dict[str, Any]:
    """Compress old dialogue history if it exceeds the context window."""
    history = state.get("dialogue_history", [])
    summary = state.get("context_summary", "")

    # Convert history entries to plain dicts for processing
    history_dicts = [dict(e) if not isinstance(e, dict) else e for e in history]

    new_summary, recent = await compress_context(history_dicts, summary)

    # If compression happened, we need to replace the full history
    # Since we use `add` reducer, we store compressed state as summary
    return {
        "context_summary": new_summary,
    }


async def node_set_proposer(state: DebateGraphState) -> dict[str, Any]:
    """Set current speaker to the first participant (proposer)."""
    participants = state.get("participants", ["proposer", "opposer"])
    return {
        "current_speaker": participants[0],
        "current_speaker_index": 0,
    }


async def node_set_opposer(state: DebateGraphState) -> dict[str, Any]:
    """Set current speaker to the second participant (opposer)."""
    participants = state.get("participants", ["proposer", "opposer"])
    return {
        "current_speaker": participants[1] if len(participants) > 1 else participants[0],
        "current_speaker_index": 1,
    }


async def node_debater_speak(state: DebateGraphState) -> dict[str, Any]:
    """Wrapper around debater_speak for the LangGraph node."""
    return await debater_speak(state)


async def node_fact_check(state: DebateGraphState) -> dict[str, Any]:
    """Wrapper around fact_check for the LangGraph node."""
    return await fact_check(state)


async def node_judge_score(state: DebateGraphState) -> dict[str, Any]:
    """Wrapper around judge_score for the LangGraph node."""
    return await judge_score(state)


async def node_advance_turn(state: DebateGraphState) -> dict[str, Any]:
    """Increment the turn counter after all participants have spoken and been judged."""
    current = state.get("current_turn", 0)
    return {
        "current_turn": current + 1,
    }


# ── Conditional edges ───────────────────────────────────────────

def should_continue(state: DebateGraphState) -> str:
    """After advancing turn, decide whether to continue or end."""
    current_turn = state.get("current_turn", 0) + 1  # +1 because advance hasn't applied yet
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
      manage_context → set_proposer → proposer_speaks → fact_check_proposer →
      set_opposer → opposer_speaks → fact_check_opposer →
      judge → advance_turn → {continue: manage_context, end: END}
    """
    graph = StateGraph(DebateGraphState)

    # Add nodes
    graph.add_node("manage_context", node_manage_context)
    graph.add_node("set_proposer", node_set_proposer)
    graph.add_node("proposer_speaks", node_debater_speak)
    graph.add_node("fact_check_proposer", node_fact_check)
    graph.add_node("set_opposer", node_set_opposer)
    graph.add_node("opposer_speaks", node_debater_speak)
    graph.add_node("fact_check_opposer", node_fact_check)
    graph.add_node("judge", node_judge_score)
    graph.add_node("advance_turn", node_advance_turn)

    # Define edges — linear flow within each turn
    graph.set_entry_point("manage_context")
    graph.add_edge("manage_context", "set_proposer")
    graph.add_edge("set_proposer", "proposer_speaks")
    graph.add_edge("proposer_speaks", "fact_check_proposer")
    graph.add_edge("fact_check_proposer", "set_opposer")
    graph.add_edge("set_opposer", "opposer_speaks")
    graph.add_edge("opposer_speaks", "fact_check_opposer")
    graph.add_edge("fact_check_opposer", "judge")
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
