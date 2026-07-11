"""
Tests for the LangGraph debate graph — compilation and reducer behaviour.
"""

from operator import add

import pytest


def test_graph_compiles():
    """Graph should compile without errors."""
    from app.agents.graph import compile_debate_graph
    app = compile_debate_graph()
    assert app is not None


def test_debate_graph_state_reducers():
    """Verify that shared_knowledge and dialogue_history use `add` reducer."""
    from app.agents.graph import DebateGraphState
    import typing

    hints = typing.get_type_hints(DebateGraphState, include_extras=True)

    # dialogue_history should be Annotated[list, add]
    dh_hint = hints.get("dialogue_history")
    assert dh_hint is not None
    args = typing.get_args(dh_hint)
    assert len(args) == 2 and args[1] is add, "dialogue_history must use `add` reducer"

    # shared_knowledge should also be Annotated[list, add]
    sk_hint = hints.get("shared_knowledge")
    assert sk_hint is not None
    args = typing.get_args(sk_hint)
    assert len(args) == 2 and args[1] is add, "shared_knowledge must use `add` reducer"

    assert hints.get("run_id") is str, "graph state must carry run_id for run-scoped runtime queues"


def test_add_reducer_appends():
    """Sanity check: `add` reducer appends lists, not replaces."""
    existing = [{"type": "fact", "content": "A"}]
    delta = [{"type": "memo", "content": "B"}]
    result = add(existing, delta)
    assert len(result) == 2
    assert result[0]["content"] == "A"
    assert result[1]["content"] == "B"


@pytest.mark.asyncio
async def test_manage_context_consumes_interventions_by_run(monkeypatch):
    from app.agents import graph
    from app.dependencies import get_intervention_manager

    manager = get_intervention_manager()
    await manager.clear_run("run-1")
    await manager.add_intervention("run-1", "请回应这个补充问题")

    result = await graph.node_manage_context(
        {
            "run_id": "run-1",
            "session_id": "shared-session",
            "current_turn": 0,
            "shared_knowledge": [],
        }
    )

    assert await manager.get_interventions("run-1") == []
    assert len(result["dialogue_history"]) == 1
    assert result["dialogue_history"][0]["role"] == "audience"
    assert result["dialogue_history"][0]["content"] == "请回应这个补充问题"


def test_debate_graph_routes_resumed_final_turn_to_consensus_or_end():
    from app.agents.graph import should_route_after_manage_context

    assert should_route_after_manage_context(
        {
            "current_turn": 3,
            "max_turns": 3,
            "reasoning_config": {"consensus_enabled": True},
            "dialogue_history": [],
        }
    ) == "consensus"

    assert should_route_after_manage_context(
        {
            "current_turn": 3,
            "max_turns": 3,
            "reasoning_config": {"consensus_enabled": False},
            "dialogue_history": [],
        }
    ) == "end"

    assert should_route_after_manage_context(
        {
            "current_turn": 3,
            "max_turns": 3,
            "reasoning_config": {"consensus_enabled": True},
            "dialogue_history": [
                {"role": "consensus_summary", "discussion_kind": "consensus"}
            ],
        }
    ) == "end"

    assert should_route_after_manage_context(
        {
            "current_turn": 2,
            "max_turns": 3,
            "reasoning_config": {"consensus_enabled": True},
            "dialogue_history": [],
        }
    ) == "set_speaker"


def test_debate_graph_routes_to_pre_round_group_discussion_when_enabled():
    from app.agents.graph import should_route_after_manage_context

    assert should_route_after_manage_context(
        {
            "current_turn": 0,
            "max_turns": 3,
            "reasoning_config": {"group_discussion_rounds": 1},
            "dialogue_history": [],
        }
    ) == "group_discussion"


def test_debate_graph_honors_resume_next_node_before_repeating_group_discussion():
    from app.agents.graph import should_route_after_manage_context

    assert should_route_after_manage_context(
        {
            "current_turn": 0,
            "max_turns": 5,
            "reasoning_config": {"group_discussion_rounds": 1},
            "dialogue_history": [],
            "resume_next_node": "set_speaker",
            "resume_origin_turn": 0,
        }
    ) == "set_speaker"

    assert should_route_after_manage_context(
        {
            "current_turn": 0,
            "max_turns": 3,
            "reasoning_config": {"group_discussion_rounds": 0},
            "dialogue_history": [],
        }
    ) == "set_speaker"

    assert should_route_after_manage_context(
        {
            "current_turn": 1,
            "max_turns": 3,
            "reasoning_config": {"group_discussion_rounds": 2},
            "dialogue_history": [
                {"role": "group_discussion", "turn": 1, "discussion_round": 1},
            ],
        }
    ) == "group_discussion"

    assert should_route_after_manage_context(
        {
            "current_turn": 1,
            "max_turns": 3,
            "reasoning_config": {"group_discussion_rounds": 2},
            "dialogue_history": [
                {"role": "group_discussion", "turn": 1, "discussion_round": 1},
                {"role": "group_discussion", "turn": 1, "discussion_round": 2},
            ],
        }
    ) == "set_speaker"


def test_debate_graph_routes_from_final_speaker_to_judge():
    from app.agents.graph import should_execute_tools

    assert should_execute_tools(
        {
            "messages": [],
            "participants": ["proposer", "opposer"],
            "current_speaker_index": 1,
            "reasoning_config": {"group_discussion_rounds": 1},
        }
    ) == "judge"

    assert should_execute_tools(
        {
            "messages": [],
            "participants": ["proposer", "opposer"],
            "current_speaker_index": 1,
            "reasoning_config": {"group_discussion_rounds": 0},
        }
    ) == "judge"
