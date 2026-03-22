"""
Tests for team discussion prompt construction.
"""

from __future__ import annotations

import pytest

from app.agents import team_discussion


@pytest.mark.asyncio
async def test_team_discuss_includes_side_previous_judge_feedback_in_member_and_summary_prompts(monkeypatch):
    captured_instructions: list[str] = []

    async def fake_invoke_text_model(messages, *, override=None, tools=None, on_progress=None, timeout_seconds=None, heartbeat_interval_seconds=None):
        captured_instructions.append(messages[-1].content)
        return "内部建议"

    monkeypatch.setattr(team_discussion, "get_debater_system_prompt", lambda role: "系统提示")
    monkeypatch.setattr(team_discussion, "invoke_text_model", fake_invoke_text_model)

    result = await team_discussion.team_discuss(
        {
            "current_speaker": "opposer",
            "topic": "Should AI be regulated?",
            "current_turn": 2,
            "max_turns": 5,
            "dialogue_history": [],
            "recent_dialogue_history": [],
            "shared_knowledge": [],
            "judge_history": [
                {
                    "target_role": "opposer",
                    "turn": 1,
                    "content": "Opposer feedback should appear.",
                    "scores": {
                        "overall_comment": "Opposer feedback should appear.",
                        "rebuttal_strength": {"score": 4, "rationale": "Need sharper attacks."},
                    },
                    "timestamp": "2026-03-21T10:00:00+00:00",
                },
                {
                    "target_role": "proposer",
                    "turn": 1,
                    "content": "Proposer feedback must stay hidden.",
                    "scores": {
                        "overall_comment": "Proposer feedback must stay hidden.",
                        "rebuttal_strength": {"score": 2, "rationale": "Should not leak."},
                    },
                    "timestamp": "2026-03-21T11:00:00+00:00",
                },
            ],
            "team_config": {"agents_per_team": 1, "discussion_rounds": 1},
            "agent_configs": {},
            "reasoning_config": {},
        }
    )

    assert len(captured_instructions) == 2
    member_instruction, summary_instruction = captured_instructions
    for instruction in (member_instruction, summary_instruction):
        assert "## Your Previous Turn Judge Feedback" in instruction
        assert "Overall Comment: Opposer feedback should appear." in instruction
        assert "Rebuttal Strength: 4/10 — Need sharper attacks." in instruction
        assert "Proposer feedback must stay hidden." not in instruction

    assert len(result["team_dialogue_history"]) == 2
    assert result["current_team_summary"]["content"] == "内部建议"


@pytest.mark.asyncio
async def test_team_discuss_falls_back_to_older_feedback_and_excludes_same_turn(monkeypatch):
    captured_instructions: list[str] = []

    async def fake_invoke_text_model(messages, *, override=None, tools=None, on_progress=None, timeout_seconds=None, heartbeat_interval_seconds=None):
        captured_instructions.append(messages[-1].content)
        return "内部建议"

    monkeypatch.setattr(team_discussion, "get_debater_system_prompt", lambda role: "系统提示")
    monkeypatch.setattr(team_discussion, "invoke_text_model", fake_invoke_text_model)

    await team_discussion.team_discuss(
        {
            "current_speaker": "opposer",
            "topic": "Should AI be regulated?",
            "current_turn": 3,
            "max_turns": 5,
            "dialogue_history": [],
            "recent_dialogue_history": [],
            "shared_knowledge": [],
            "judge_history": [
                {
                    "target_role": "opposer",
                    "turn": 0,
                    "content": "Too old to choose.",
                    "scores": {
                        "overall_comment": "Too old to choose.",
                        "topic_focus": {"score": 6, "rationale": "Baseline only."},
                    },
                    "timestamp": "2026-03-20T10:00:00+00:00",
                },
                {
                    "target_role": "opposer",
                    "turn": 1,
                    "content": "Fallback feedback should appear.",
                    "scores": {
                        "logical_rigor": {"score": 4},
                        "overall_comment": "",
                    },
                    "timestamp": "2026-03-21T10:00:00+00:00",
                },
                {
                    "target_role": "opposer",
                    "turn": 3,
                    "content": "Same-turn feedback should not appear.",
                    "scores": {"overall_comment": "Same-turn feedback should not appear."},
                    "timestamp": "2026-03-23T10:00:00+00:00",
                },
            ],
            "team_config": {"agents_per_team": 1, "discussion_rounds": 1},
            "agent_configs": {},
            "reasoning_config": {},
        }
    )

    assert len(captured_instructions) == 2
    member_instruction, summary_instruction = captured_instructions
    for instruction in (member_instruction, summary_instruction):
        assert "Overall Comment: Fallback feedback should appear." in instruction
        assert "Logical Rigor: 4/10" in instruction
        assert "Too old to choose." not in instruction
        assert "Same-turn feedback should not appear." not in instruction
