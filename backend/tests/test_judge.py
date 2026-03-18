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


def test_parse_score_response_repairs_unescaped_quotes_in_rationales():
    malformed = """{
      "logical_rigor": {"score": 8, "rationale": "成功拆解正方两个隐含前提，逻辑链条清晰，但"照料经济"论点的因果归因略显跳跃"},
      "evidence_quality": {"score": 7, "rationale": "引用了具体研究，但对"GDP=福祉"这一前提的证据仍不充分"},
      "rebuttal_strength": {"score": 9, "rationale": "精准攻击对手"权利=幸福"这个核心前提"},
      "consistency": {"score": 8, "rationale": "与前文论证保持一致"},
      "persuasiveness": {"score": 8, "rationale": "表达凝练，重点突出"},
      "overall_comment": "本轮成功拆解了"照料经济"和"GDP=福祉"两个关键前提。"
    }"""

    parsed = judge._parse_score_response(malformed)

    assert parsed is not None
    assert parsed.logical_rigor.rationale == (
        '成功拆解正方两个隐含前提，逻辑链条清晰，但"照料经济"论点的因果归因略显跳跃'
    )
    assert parsed.evidence_quality.rationale == '引用了具体研究，但对"GDP=福祉"这一前提的证据仍不充分'
    assert parsed.overall_comment == '本轮成功拆解了"照料经济"和"GDP=福祉"两个关键前提。'


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


def test_build_judge_instruction_warns_against_ascii_double_quotes():
    instruction = judge._build_judge_instruction(
        topic="Should AI regulate itself?",
        role_to_judge="proposer",
        dialogue_history=[{"role": "proposer", "content": "Argument"}],
        shared_knowledge=[],
        current_turn=0,
    )

    assert 'use Chinese quotes like 「」 instead of ASCII double quotes' in instruction
