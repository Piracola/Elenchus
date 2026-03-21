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
from datetime import datetime, timezone
from operator import add
from typing import Annotated, Any, Literal, TypedDict

from langchain_core.messages import BaseMessage, RemoveMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages

from app.agents.consensus import converge_consensus
from app.agents.debater import debater_speak
from app.agents.judge import judge_score
from app.agents.jury_discussion import jury_discuss
from app.agents.team_discussion import team_discuss
from app.agents.context_manager import compress_context
from app.agents.skills import get_all_skills
from app.agents.skills.metadata import get_tool_shared_knowledge_type
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
    team_dialogue_history: Annotated[list[DialogueEntryDict], add]
    jury_dialogue_history: Annotated[list[DialogueEntryDict], add]
    judge_history: Annotated[list[DialogueEntryDict], add]
    recent_dialogue_history: list[DialogueEntryDict]
    compressed_history_count: int
    shared_knowledge: Annotated[list[SharedKnowledgeEntry], add]
    team_config: dict[str, int]
    jury_config: dict[str, int]
    reasoning_config: dict[str, Any]
    current_team_discussion: list[DialogueEntryDict]
    current_team_summary: DialogueEntryDict | None
    current_jury_discussion: list[DialogueEntryDict]
    current_jury_summary: DialogueEntryDict | None
    
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
    interrupted_at: str | None
    
    # Node execution tracking
    last_executed_node: str  # Name of the most recently executed node


# ── Node functions ──────────────────────────────────────────────

async def node_manage_context(state: DebateGraphState) -> dict[str, Any]:
    """Compress old dialogue history if it exceeds the context window."""
    history = state.get("dialogue_history", [])
    compressed_history_count = state.get("compressed_history_count", 0)
    knowledge = state.get("shared_knowledge", [])
    agent_configs = state.get("agent_configs", {})

    history_dicts = [dict(e) if not isinstance(e, dict) else e for e in history]

    new_knowledge, recent_entries, new_compressed_history_count = await compress_context(
        history_dicts,
        knowledge,
        agent_configs,
        compressed_history_count=compressed_history_count,
        session_id=str(state.get("session_id", "") or ""),
        runtime_event_emitter=state.get("runtime_event_emitter"),
    )

    # Compute delta: only items added by compression (memos not already in knowledge)
    delta = new_knowledge[len(knowledge):]

    # Inject any pending user interventions as audience dialogue entries
    from app.dependencies import get_intervention_manager
    session_id = state.get("session_id", "")
    intervention_mgr = get_intervention_manager()
    queued = await intervention_mgr.pop_interventions(session_id)
    intervention_entries = [
        {
            "role": "audience",
            "agent_name": "观众介入",
            "content": content,
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
            "citations": [],
        }
        for content in queued
    ]

    effective_recent_history = [
        *recent_entries,
        *intervention_entries,
    ]

    return {
        "shared_knowledge": delta,
        "dialogue_history": intervention_entries,
        "recent_dialogue_history": effective_recent_history,
        "compressed_history_count": new_compressed_history_count,
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


async def node_team_discussion(state: DebateGraphState) -> dict[str, Any]:
    """Run the current side's internal discussion before public speech."""
    result = await team_discuss(state)
    result["last_executed_node"] = "team_discussion"
    return result


async def node_jury_discussion(state: DebateGraphState) -> dict[str, Any]:
    """Run the optional jury discussion before scoring."""
    result = await jury_discuss(state)
    result["last_executed_node"] = "jury_discussion"
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


async def node_judge_score(state: DebateGraphState) -> dict[str, Any]:
    """Wrapper around judge_score for the LangGraph node."""
    result = await judge_score(state)
    result["last_executed_node"] = "judge"
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
        "current_team_discussion": [],
        "current_team_summary": None,
        "current_jury_discussion": [],
        "current_jury_summary": None,
        "speech_was_streamed": False,
        "last_executed_node": "advance_turn",
    }


# ── Conditional edges ───────────────────────────────────────────

def should_prepare_team_discussion(state: DebateGraphState) -> str:
    """Route the current speaker through the optional internal team discussion."""
    team_config = state.get("team_config", {})
    agents_per_team = int(team_config.get("agents_per_team", 0) or 0)
    discussion_rounds = int(team_config.get("discussion_rounds", 0) or 0)
    if agents_per_team > 0 and discussion_rounds > 0:
        return "team_discussion"
    return "speaker"


def should_prepare_jury_discussion(state: DebateGraphState) -> str:
    """Route to the optional jury discussion after all speakers finish."""
    jury_config = state.get("jury_config", {})
    agents_per_jury = int(jury_config.get("agents_per_jury", 0) or 0)
    discussion_rounds = int(jury_config.get("discussion_rounds", 0) or 0)
    if agents_per_jury > 0 and discussion_rounds > 0:
        return "jury_discussion"
    return "judge"


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
        return should_prepare_jury_discussion(state)

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
    graph.add_node("team_discussion", node_team_discussion)
    graph.add_node("jury_discussion", node_jury_discussion)
    graph.add_node("speaker", node_debater_speak)
    graph.add_node("tool_executor", node_tool_executor)
    graph.add_node("judge", node_judge_score)
    graph.add_node("advance_turn", node_advance_turn)
    graph.add_node("consensus", node_consensus)

    # Define edges
    graph.set_entry_point("manage_context")
    graph.add_edge("manage_context", "set_speaker")
    graph.add_conditional_edges(
        "set_speaker",
        should_prepare_team_discussion,
        {
            "team_discussion": "team_discussion",
            "speaker": "speaker",
        },
    )
    graph.add_edge("team_discussion", "speaker")
    
    # From speaker, we check if they called a tool or are finished
    graph.add_conditional_edges(
        "speaker",
        should_execute_tools,
        {
            "tools": "tool_executor",
            "next_speaker": "set_speaker",
            "jury_discussion": "jury_discussion",
            "judge": "judge"
        }
    )
    graph.add_edge("jury_discussion", "judge")
    
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
