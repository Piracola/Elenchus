from app.agents.graph import should_route_after_manage_context


def test_first_turn_runs_configured_group_discussion():
    route = should_route_after_manage_context(
        {
            "current_turn": 0,
            "max_turns": 5,
            "reasoning_config": {
                "consensus_enabled": True,
                "group_discussion_rounds": 2,
            },
            "dialogue_history": [],
        }
    )

    assert route == "group_discussion"


def test_second_turn_runs_configured_group_discussion():
    route = should_route_after_manage_context(
        {
            "current_turn": 1,
            "max_turns": 5,
            "reasoning_config": {
                "consensus_enabled": True,
                "group_discussion_rounds": 1,
            },
            "dialogue_history": [],
        }
    )

    assert route == "group_discussion"
