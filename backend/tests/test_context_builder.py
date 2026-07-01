from app.agents.context_builder import (
    _extract_judge_weakness_lines,
    build_runtime_context_for_agent,
)


def test_build_runtime_context_for_agent_renders_context_packet_sections():
    context = build_runtime_context_for_agent(
        {
            "participants": ["proposer", "opposer"],
            "dialogue_history": [
                {"role": "group_discussion", "agent_name": "组内讨论", "content": "先厘清定义边界。", "turn": 1},
                {"role": "proposer", "agent_name": "正方", "content": "成立条件是可验证性。", "turn": 1},
                {"role": "opposer", "agent_name": "反方", "content": "你忽略了执行成本。", "turn": 1},
            ],
            "shared_knowledge": [
                {"type": "fact", "query": "AI regulation 2024", "result": "A cited result", "source_turn": 1},
                {"type": "round_digest", "content": "上一轮集中在定义稳定性。", "source_turn": 0, "source_role": "proposer"},
            ],
        },
        agent_role="proposer",
        topic="AI should be regulated",
        current_turn=1,
        max_turns=5,
        judge_feedback_lines=["Overall Comment: Need stronger evidence."],
        live_constraints=["只输出正式发言。"],
        judge_feedback_title="## Your Previous Turn Judge Feedback",
    )

    assert "## Task Frame" in context
    assert "## Historical Context Safety" in context
    assert "## Current Planning Context" in context
    assert "## Exact Recent Dialogue" in context
    assert "## Evidence Context" in context
    assert "## Historical Digest" in context
    assert "## Judge Feedback" in context
    assert "## Your Previous Turn Judge Feedback" in context
    assert "A cited result" in context
    assert "上一轮集中在定义稳定性。" in context
    assert "先厘清定义边界。" in context


def test_extract_judge_weakness_lines_orders_low_scores_first():
    lines = _extract_judge_weakness_lines(
        {
            "logical_rigor": {"score": 7, "rationale": "Mostly coherent."},
            "evidence_quality": {"score": 4, "rationale": "Need stronger evidence."},
            "consistency": {"score": 5, "rationale": "Claims drifted."},
            "topic_focus": {"score": 6, "rationale": "Slightly broad."},
        }
    )

    assert lines[0] == "- Evidence Quality: 4/10 — Need stronger evidence."
    assert lines[1] == "- Consistency: 5/10 — Claims drifted."
    assert lines[2] == "- Topic Focus: 6/10 — Slightly broad."
