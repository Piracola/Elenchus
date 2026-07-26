"""
LangGraph debate state machine — the core orchestration graph.

Flow per turn (Dynamic Tool Calling):
  manage_context → group_discussion → set_speaker → debater_speak ↔ tool_executor
                                                 ↓
                                            advance_turn (loop until all speak)
                                                 ↓
  (next turn or END)
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from operator import add
from typing import Annotated, Any, Literal, TypedDict

from langchain_core.messages import BaseMessage, RemoveMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages

from app.agents.consensus import converge_consensus
from app.agents.context_engine import build_round_digest, merge_round_digest_knowledge
from app.agents.debater import debater_speak
from app.agents.fact_checker import fact_check_turn
from app.agents.group_discussion import run_group_discussion
from app.agents.judge import judge_score
from app.tools import get_all_skills
from app.tools.metadata import get_tool_shared_knowledge_type
from app.models.state import DialogueEntryDict, SharedKnowledgeEntry

logger = logging.getLogger(__name__)


def _build_tool_knowledge_entry(
    tool_fn: Any,
    tool_call: dict[str, Any],
    result_content: Any,
    *,
    current_role: str,
    current_agent_name: str,
    current_turn: int,
) -> SharedKnowledgeEntry | None:
    """Convert selected tool results into shared knowledge entries."""
    if get_tool_shared_knowledge_type(tool_fn) != "fact":
        return None

    args = tool_call.get("args")
    query = args.get("query", "") if isinstance(args, dict) else ""
    result_text = str(result_content)
    truncated_result = result_text[:500] + ("..." if len(result_text) > 500 else "")

    return {
        "type": "fact",
        "query": query if isinstance(query, str) else "",
        "result": truncated_result,
        "source_kind": "tool_call",
        "source_role": current_role,
        "source_agent_name": current_agent_name,
        "source_turn": current_turn,
    }


# ── LangGraph State Type ────────────────────────────────────────

class DebateGraphState(TypedDict, total=False):
    """State flowing through the LangGraph debate graph."""

    run_id: str
    session_id: str
    topic: str
    debate_mode: str
    mode_config: dict[str, Any]
    participants: list[str]
    current_turn: int
    max_turns: int
    current_speaker: str
    current_speaker_index: int

    dialogue_history: Annotated[list[DialogueEntryDict], add]
    judge_history: Annotated[list[DialogueEntryDict], add]
    shared_knowledge: Annotated[list[SharedKnowledgeEntry], add]
    reasoning_config: dict[str, Any]
    speech_config: dict[str, int]
    
    messages: Annotated[list[BaseMessage], add_messages]

    current_scores: dict[str, Any]
    cumulative_scores: dict[str, Any]
    mode_artifacts: Annotated[list[dict[str, Any]], add]
    current_mode_report: dict[str, Any] | None
    final_mode_report: dict[str, Any] | None
    builtin_reference_docs: list[dict[str, Any]]

    status: Literal['in_progress', 'completed', 'error']
    error: str | None
    agent_configs: dict[str, dict[str, Any]]
    runtime_event_emitter: Any
    speech_was_streamed: bool
    last_progress_at: str
    last_status_message: str
    resume_count: int
    resume_next_node: str
    resume_origin_turn: int
    interrupted_at: str | None
    
    # Node execution tracking
    last_executed_node: str  # Name of the most recently executed node


# ── Node functions ──────────────────────────────────────────────

def _has_round_digest_for_turn(knowledge: list[Any], turn_index: int) -> bool:
    return any(
        isinstance(entry, dict)
        and str(entry.get("type", "") or "") == "round_digest"
        and _coerce_turn(entry.get("source_turn", -1), -1) == turn_index
        for entry in knowledge
    )


async def node_manage_context(state: DebateGraphState) -> dict[str, Any]:
    """Prepare derived context artifacts before a new turn starts."""
    knowledge = state.get("shared_knowledge", [])
    current_turn = int(state.get("current_turn", 0) or 0)

    updated_knowledge = list(knowledge) if isinstance(knowledge, list) else []
    # Idempotency guard: re-entry (resume / intervention re-injection) must not
    # pay another LLM call when the previous round is already summarized.
    if current_turn > 0 and not _has_round_digest_for_turn(updated_knowledge, current_turn - 1):
        digest_entry = await build_round_digest(state, turn_index=current_turn - 1)
        updated_knowledge = merge_round_digest_knowledge(updated_knowledge, digest_entry)

    return {
        "shared_knowledge": updated_knowledge,
        "last_executed_node": "manage_context",
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
        return {"last_executed_node": "set_speaker"}

    return {
        "current_speaker": participants[next_idx],
        "current_speaker_index": next_idx,
        "last_executed_node": "set_speaker",
    }


async def node_debater_speak(state: DebateGraphState) -> dict[str, Any]:
    """Wrapper around debater_speak for the LangGraph node."""
    result = await debater_speak(state)
    result["last_executed_node"] = "speaker"
    return result


async def node_tool_executor(state: DebateGraphState) -> dict[str, Any]:
    """Executes the tool called by the LLM and feeds it back into the messages list and shared_knowledge."""
    messages = state.get("messages", [])
    if not messages:
        return {"last_executed_node": "tool_executor"}
        
    last_message = messages[-1]
    results = []
    knowledge_updates = []
    current_role = str(state.get("current_speaker", "") or "")
    role_config = (state.get("agent_configs", {}) or {}).get(current_role, {})
    current_agent_name = str(role_config.get("custom_name", current_role) or current_role)
    current_turn = int(state.get("current_turn", 0) or 0)
    
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
                
                knowledge_update = _build_tool_knowledge_entry(
                    tool_fn,
                    tool_call,
                    result_content,
                    current_role=current_role,
                    current_agent_name=current_agent_name,
                    current_turn=current_turn,
                )
                if knowledge_update:
                    knowledge_updates.append(knowledge_update)
            
    return {
        "messages": results,
        "shared_knowledge": knowledge_updates,
        "last_executed_node": "tool_executor",
    }


async def node_fact_check(state: DebateGraphState) -> dict[str, Any]:
    """Verify this turn's factual claims before the judge scores them."""
    result = await fact_check_turn(state)
    result["last_executed_node"] = "fact_check"
    return result


async def node_judge_score(state: DebateGraphState) -> dict[str, Any]:
    """Wrapper around judge_score for the LangGraph node."""
    result = await judge_score(state)
    result["last_executed_node"] = "judge"
    return result


async def node_group_discussion(state: DebateGraphState) -> dict[str, Any]:
    """Run the configured pre-round group discussion."""
    result = await run_group_discussion(state)
    result["last_executed_node"] = "group_discussion"
    return result


async def node_consensus(state: DebateGraphState) -> dict[str, Any]:
    """Generate the final consensus convergence memo."""
    result = await converge_consensus(state)
    result["last_executed_node"] = "consensus"
    return result


async def node_advance_turn(state: DebateGraphState) -> dict[str, Any]:
    """Increment the turn counter and reset speaker index."""
    current = state.get("current_turn", 0)
    messages = state.get("messages", [])
    
    # We must explicitly return RemoveMessage for each message to clear the state,
    # because `add_messages` reducer requires this to delete items.
    remove_msgs = [RemoveMessage(id=m.id) for m in messages if m.id]
    
    return {
        "current_turn": current + 1,
        "current_speaker_index": -1, # Reset for the next round
        "messages": remove_msgs, # Clear internal tool messages
        "speech_was_streamed": False,
        "last_executed_node": "advance_turn",
    }


# ── Conditional edges ───────────────────────────────────────────

def _has_pending_tool_calls(state: DebateGraphState) -> bool:
    """Check if the debater emitted a tool call that needs execution."""
    messages = state.get("messages", [])
    if messages:
        last_message = messages[-1]
        if hasattr(last_message, "tool_calls") and last_message.tool_calls:
            return True
    return False


def _is_fact_check_enabled(state: DebateGraphState) -> bool:
    reasoning_config = state.get("reasoning_config", {})
    if not isinstance(reasoning_config, dict):
        return True
    return bool(reasoning_config.get("fact_check_enabled", True))


def _get_next_speaker_route(state: DebateGraphState) -> str:
    """Determine the next route after a debater finishes (no tool calls pending)."""
    participants = state.get("participants", ["proposer", "opposer"])
    current_idx = state.get("current_speaker_index", 0)
    if current_idx + 1 < len(participants):
        return "next_speaker"
    return "fact_check" if _is_fact_check_enabled(state) else "judge"


def _get_group_discussion_rounds(state: DebateGraphState) -> int:
    reasoning_config = state.get("reasoning_config", {})
    try:
        return int(reasoning_config.get("group_discussion_rounds", 0) or 0)
    except (AttributeError, TypeError, ValueError):
        return 0


def _current_turn_group_discussion_count(state: DebateGraphState) -> int:
    current_turn = _coerce_turn(state.get("current_turn", 0), 0)
    dialogue_history = state.get("dialogue_history", [])
    if not isinstance(dialogue_history, list):
        return 0

    count = 0
    for entry in dialogue_history:
        if not isinstance(entry, dict):
            continue
        if entry.get("role") != "group_discussion":
            continue
        if _coerce_turn(entry.get("turn", -1), -1) == current_turn:
            count += 1
    return count


def _should_run_pre_round_group_discussion(state: DebateGraphState) -> bool:
    current_turn = _coerce_turn(state.get("current_turn", 0), 0)
    if current_turn < 0:
        return False
    configured_rounds = _get_group_discussion_rounds(state)
    if configured_rounds <= 0:
        return False
    return _current_turn_group_discussion_count(state) < configured_rounds


def should_execute_tools(state: DebateGraphState) -> str:
    """Route after debater speaks: execute tools if pending, otherwise advance speakers."""
    if _has_pending_tool_calls(state):
        return "tools"
    return _get_next_speaker_route(state)


def _coerce_turn(value: Any, fallback: int) -> int:
    if isinstance(value, int):
        return value
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _turn_limit_reached(state: DebateGraphState) -> bool:
    current_turn = _coerce_turn(state.get("current_turn", 0), 0)
    max_turns = _coerce_turn(state.get("max_turns", 5), 5)
    return max_turns > 0 and current_turn >= max_turns


def _has_consensus_summary(state: DebateGraphState) -> bool:
    dialogue_history = state.get("dialogue_history", [])
    if not isinstance(dialogue_history, list):
        return False
    return any(
        isinstance(entry, dict)
        and (
            entry.get("role") == "consensus_summary"
            or entry.get("discussion_kind") == "consensus"
        )
        for entry in dialogue_history
    )


def should_route_after_manage_context(state: DebateGraphState) -> str:
    """Avoid starting another round when a resumed run is already at the turn limit."""
    resume_next_node = str(state.get("resume_next_node", "") or "")
    resume_origin_turn = _coerce_turn(state.get("resume_origin_turn", -1), -1)
    current_turn = _coerce_turn(state.get("current_turn", 0), 0)
    if resume_next_node and resume_origin_turn == current_turn:
        return resume_next_node

    if not _turn_limit_reached(state):
        if _should_run_pre_round_group_discussion(state):
            return "group_discussion"
        return "set_speaker"

    reasoning_config = state.get("reasoning_config", {})
    if (
        bool(reasoning_config.get("consensus_enabled", True))
        and not _has_consensus_summary(state)
    ):
        return "consensus"
    return "end"


def should_continue(state: DebateGraphState) -> str:
    """After advancing turn, decide whether to continue or end."""
    current_turn = state.get("current_turn", 0)
    max_turns = state.get("max_turns", 5)
    reasoning_config = state.get("reasoning_config", {})

    if current_turn >= max_turns:
        logger.info("Debate complete: reached max turns (%d/%d)", current_turn, max_turns)
        if bool(reasoning_config.get("consensus_enabled", True)):
            return "consensus"
        return "end"
    else:
        logger.info("Continuing to turn %d/%d", current_turn + 1, max_turns)
        return "continue"


# ── Build the graph ─────────────────────────────────────────────

def build_debate_graph() -> StateGraph:
    """
    Construct the debate LangGraph.

    Graph flow (per turn):
      manage_context → group_discussion → set_speaker → debater_speaks ↔ tool_executor
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
    graph.add_node("group_discussion", node_group_discussion)
    graph.add_node("fact_check", node_fact_check)
    graph.add_node("judge", node_judge_score)
    graph.add_node("advance_turn", node_advance_turn)
    graph.add_node("consensus", node_consensus)

    # Define edges
    graph.set_entry_point("manage_context")
    graph.add_conditional_edges(
        "manage_context",
        should_route_after_manage_context,
        {
            "group_discussion": "group_discussion",
            "set_speaker": "set_speaker",
            "consensus": "consensus",
            "end": END,
            # Resume / re-injection can target any mid-turn node; every value
            # predict_resume_next_node may return must be mapped or LangGraph
            # raises KeyError when routing.
            "speaker": "speaker",
            "tool_executor": "tool_executor",
            "fact_check": "fact_check",
            "judge": "judge",
            "advance_turn": "advance_turn",
        },
    )
    graph.add_edge("group_discussion", "set_speaker")
    graph.add_edge("set_speaker", "speaker")
    
    # From speaker, we check if they called a tool or are finished
    graph.add_conditional_edges(
        "speaker",
        should_execute_tools,
        {
            "tools": "tool_executor",
            "next_speaker": "set_speaker",
            "fact_check": "fact_check",
            "judge": "judge",
        }
    )

    # Tools feed back into the speaker to resolve the thought process
    graph.add_edge("tool_executor", "speaker")

    # Fact check runs once per turn, after all speeches and before scoring.
    graph.add_edge("fact_check", "judge")

    # Judge flows to advance turn
    graph.add_edge("judge", "advance_turn")

    # Conditional: continue to next turn or end
    graph.add_conditional_edges(
        "advance_turn",
        should_continue,
        {
            "continue": "manage_context",
            "consensus": "consensus",
            "end": END,
        },
    )
    graph.add_edge("consensus", END)

    return graph


def compile_debate_graph():
    """Build and compile the debate graph, ready for execution."""
    graph = build_debate_graph()
    return graph.compile()
