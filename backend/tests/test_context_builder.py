from app.agents.context_builder import build_context_for_agent


def test_build_context_for_agent_renders_knowledge_and_recent_dialogue():
    context = build_context_for_agent(
        shared_knowledge=[
            {"type": "memo", "agent_name": "Proposer", "content": "Earlier argument"},
            {"type": "fact", "query": "AI safety", "result": "A cited result"},
        ],
        recent_history=[
            {"role": "proposer", "agent_name": "Proposer", "content": "Current point"},
            {"role": "opposer", "agent_name": "Opposer", "content": "Counter point"},
        ],
        topic="AI should be regulated",
        current_turn=1,
        max_turns=5,
    )

    assert "## Debate Topic\nAI should be regulated" in context
    assert "## Progress\nTurn 2 of 5" in context
    assert "- [Historical Memo - Proposer]: Earlier argument" in context
    assert "- [Verified Fact for 'AI safety']: A cited result" in context
    assert "**[Proposer]**: Current point" in context
    assert "**[Opposer]**: Counter point" in context
