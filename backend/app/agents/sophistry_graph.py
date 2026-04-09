"""Standalone LangGraph flow for the sophistry experiment mode."""

from __future__ import annotations

from typing import Any

from langgraph.graph import END, StateGraph

from app.agents.graph import (
    DebateGraphState,
    node_advance_turn,
    node_manage_context,
    node_set_speaker,
)
from app.agents.sophistry_debater import sophistry_debater_speak
from app.agents.sophistry_observer import sophistry_final_report, sophistry_observer_report


async def node_sophistry_speaker(state: DebateGraphState) -> dict[str, Any]:
    result = await sophistry_debater_speak(state)
    result["last_executed_node"] = "sophistry_speaker"
    return result


async def node_sophistry_observer(state: DebateGraphState) -> dict[str, Any]:
    result = await sophistry_observer_report(state)
    result["last_executed_node"] = "sophistry_observer"
    return result


async def node_sophistry_postmortem(state: DebateGraphState) -> dict[str, Any]:
    result = await sophistry_final_report(state)
    result["last_executed_node"] = "sophistry_postmortem"
    return result


def should_route_after_set_speaker(state: DebateGraphState) -> str:
    current_speaker = str(state.get("current_speaker", "") or "")
    if current_speaker:
        return "speaker"
    return "observer"


def should_route_after_speaker(state: DebateGraphState) -> str:
    participants = state.get("participants", ["proposer", "opposer"])
    current_idx = int(state.get("current_speaker_index", -1) if state.get("current_speaker_index") is not None else -1)
    if current_idx + 1 < len(participants):
        return "next_speaker"
    return "observer"


def should_continue_after_advance(state: DebateGraphState) -> str:
    current_turn = int(state.get("current_turn", 0) or 0)
    max_turns = int(state.get("max_turns", 5) or 5)
    if current_turn >= max_turns:
        return "postmortem"
    return "continue"


def build_sophistry_graph() -> StateGraph:
    graph = StateGraph(DebateGraphState)

    graph.add_node("manage_context", node_manage_context)
    graph.add_node("set_speaker", node_set_speaker)
    graph.add_node("sophistry_speaker", node_sophistry_speaker)
    graph.add_node("sophistry_observer", node_sophistry_observer)
    graph.add_node("advance_turn", node_advance_turn)
    graph.add_node("sophistry_postmortem", node_sophistry_postmortem)

    graph.set_entry_point("manage_context")
    graph.add_edge("manage_context", "set_speaker")
    graph.add_conditional_edges(
        "set_speaker",
        should_route_after_set_speaker,
        {
            "speaker": "sophistry_speaker",
            "observer": "sophistry_observer",
        },
    )
    graph.add_conditional_edges(
        "sophistry_speaker",
        should_route_after_speaker,
        {
            "next_speaker": "set_speaker",
            "observer": "sophistry_observer",
        },
    )
    graph.add_edge("sophistry_observer", "advance_turn")
    graph.add_conditional_edges(
        "advance_turn",
        should_continue_after_advance,
        {
            "continue": "manage_context",
            "postmortem": "sophistry_postmortem",
        },
    )
    graph.add_edge("sophistry_postmortem", END)

    return graph


def compile_sophistry_graph() -> Any:
    return build_sophistry_graph().compile()
