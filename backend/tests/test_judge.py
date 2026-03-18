"""
Tests for judge scoring robustness.
"""

from __future__ import annotations

import json

import pytest

from app.agents import judge


def _score_payload(score: int = 8) -> dict[str, object]:
    return {
        "logical_rigor": {"score": score, "rationale": "Clear reasoning."},
        "evidence_quality": {"score": score - 1, "rationale": "Good evidence."},
        "rebuttal_strength": {"score": score, "rationale": "Strong rebuttals."},
        "consistency": {"score": score, "rationale": "Consistent position."},
        "persuasiveness": {"score": score - 1, "rationale": "Mostly persuasive."},
        "overall_comment": "Solid performance overall.",
    }


@pytest.mark.asyncio
async def test_judge_score_parses_json_wrapped_in_markdown(monkeypatch):
    async def fake_invoke_text_model(messages, *, override=None, tools=None):
        payload = json.dumps(_score_payload(), ensure_ascii=False, indent=2)
        return f"```json\n{payload}\n```"

    monkeypatch.setattr(judge, "get_judge_prompt", lambda: "Judge carefully.")
    monkeypatch.setattr(judge, "invoke_text_model", fake_invoke_text_model)

    result = await judge.judge_score(
        {
            "topic": "Should AI regulate itself?",
            "participants": ["proposer"],
            "dialogue_history": [{"role": "proposer", "content": "Argument"}],
            "shared_knowledge": [],
            "current_turn": 0,
            "cumulative_scores": {},
            "agent_configs": {},
        }
    )

    proposer_scores = result["current_scores"]["proposer"]
    assert proposer_scores["logical_rigor"]["score"] == 8
    assert proposer_scores["overall_comment"] == "Solid performance overall."
    assert result["cumulative_scores"]["proposer"]["logical_rigor"] == [8]
    assert result["judge_history"][0]["target_role"] == "proposer"
    assert result["judge_history"][0]["role"] == "judge"


def test_parse_score_response_extracts_embedded_json():
    payload = json.dumps(_score_payload(), ensure_ascii=False)
    wrapped = f"Here is the score object:\n{payload}\nUse it directly."

    parsed = judge._parse_score_response(wrapped)

    assert parsed is not None
    assert parsed.logical_rigor.score == 8


def test_default_scores_use_localized_fallback_comment():
    fallback = judge._default_scores()

    assert fallback["overall_comment"] == "评分解析失败，本轮暂按中性分处理。"
    assert fallback["logical_rigor"]["score"] == 5


@pytest.mark.asyncio
async def test_judge_uses_dialogue_history_when_recent_is_stale(monkeypatch):
    captured_instructions: list[str] = []

    async def fake_invoke_text_model(messages, *, override=None, tools=None):
        captured_instructions.append(messages[-1].content)
        return json.dumps(_score_payload(), ensure_ascii=False)

    monkeypatch.setattr(judge, "get_judge_prompt", lambda: "Judge carefully.")
    monkeypatch.setattr(judge, "invoke_text_model", fake_invoke_text_model)

    result = await judge.judge_score(
        {
            "topic": "Should AI regulate itself?",
            "participants": ["proposer"],
            "dialogue_history": [{"role": "proposer", "content": "这是本轮实质发言"}],
            "recent_dialogue_history": [],
            "shared_knowledge": [],
            "current_turn": 0,
            "cumulative_scores": {},
            "agent_configs": {},
        }
    )

    assert captured_instructions
    assert "这是本轮实质发言" in captured_instructions[0]
    assert result["judge_history"][0]["target_role"] == "proposer"
