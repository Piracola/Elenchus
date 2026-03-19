"""
Tests for the LangGraph debate graph — compilation and reducer behaviour.
"""

from operator import add


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

    team_hint = hints.get("team_dialogue_history")
    assert team_hint is not None
    args = typing.get_args(team_hint)
    assert len(args) == 2 and args[1] is add, "team_dialogue_history must use `add` reducer"

    jury_hint = hints.get("jury_dialogue_history")
    assert jury_hint is not None
    args = typing.get_args(jury_hint)
    assert len(args) == 2 and args[1] is add, "jury_dialogue_history must use `add` reducer"


def test_add_reducer_appends():
    """Sanity check: `add` reducer appends lists, not replaces."""
    existing = [{"type": "fact", "content": "A"}]
    delta = [{"type": "memo", "content": "B"}]
    result = add(existing, delta)
    assert len(result) == 2
    assert result[0]["content"] == "A"
    assert result[1]["content"] == "B"
