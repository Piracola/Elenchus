from app.agents.context_builder import build_context_for_agent


def test_build_context_for_agent_renders_knowledge_and_recent_dialogue():
    context = build_context_for_agent(
        shared_knowledge=[
            {"type": "memo", "agent_name": "Proposer", "content": "Earlier argument"},
            {"type": "fact", "query": "AI safety", "result": "A cited result"},
            {
                "type": "reference_summary",
                "document_name": "体系说明.md",
                "content": "这是该体系的核心设计摘要。",
            },
            {
                "type": "reference_term",
                "title": "分层控制",
                "document_name": "体系说明.md",
                "content": "把职责拆成多个独立层级。",
            },
            {
                "type": "reference_claim",
                "title": "采用率",
                "content": "该体系在 2024 年被 68% 的受访团队采用。",
                "validation_status": "unverified",
            },
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
    assert "- [Reference Summary - 体系说明.md]: 这是该体系的核心设计摘要。" in context
    assert "- [Reference Term - 分层控制 | 体系说明.md]: 把职责拆成多个独立层级。" in context
    assert "- [Reference Claim - 采用率 | status=unverified]: 该体系在 2024 年被 68% 的受访团队采用。" in context
    assert "**[Proposer]**: Current point" in context
    assert "**[Opposer]**: Counter point" in context
