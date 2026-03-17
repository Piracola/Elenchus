"""
Judge node that evaluates each debater and produces structured scores.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import ValidationError

from app.agents.prompt_loader import get_judge_prompt
from app.agents.safe_invoke import invoke_text_model
from app.models.scoring import TurnScore

logger = logging.getLogger(__name__)

_SCORE_DIMS = [
    "logical_rigor",
    "evidence_quality",
    "rebuttal_strength",
    "consistency",
    "persuasiveness",
]

_OUTPUT_SCHEMA = {
    "logical_rigor": {"score": 1, "rationale": "Explain the score."},
    "evidence_quality": {"score": 1, "rationale": "Explain the score."},
    "rebuttal_strength": {"score": 1, "rationale": "Explain the score."},
    "consistency": {"score": 1, "rationale": "Explain the score."},
    "persuasiveness": {"score": 1, "rationale": "Explain the score."},
    "overall_comment": "One concise summary of the debater's performance.",
}


def _build_judge_instruction(
    topic: str,
    role_to_judge: str,
    dialogue_history: list[dict[str, Any]],
    shared_knowledge: list[dict[str, Any]],
    current_turn: int,
) -> str:
    """Build the user message for the judge."""
    parts = [
        f"## Task\nScore the **{role_to_judge}** debater for turn {current_turn + 1}.\n",
        f"## Debate Topic\n{topic}\n",
        "## Complete Dialogue History",
    ]

    for entry in dialogue_history:
        role = entry.get("role", "")
        content = entry.get("content", "")
        marker = " <- being judged" if role == role_to_judge else ""
        parts.append(f"\n### [{role}]{marker}\n{content}")

    facts = [item for item in shared_knowledge if item.get("type") == "fact"]
    if facts:
        parts.append("\n## Fact Check Results")
        for fact in facts:
            parts.append(
                f"- Query: {fact.get('query', '')}\n  Result: {fact.get('result', '')}"
            )

    parts.append(
        "\n## Instructions\n"
        "Score this debater on all 5 dimensions from 1 to 10 and explain each score. "
        "Return ONLY valid JSON. Do not include markdown fences, headings, or prose.\n"
        f"## Required JSON Shape\n{json.dumps(_OUTPUT_SCHEMA, ensure_ascii=False, indent=2)}"
    )

    return "\n".join(parts)


def _parse_score_response(text: str) -> TurnScore | None:
    """Parse a judge response into a TurnScore."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    try:
        data = json.loads(cleaned)
        return TurnScore(**data)
    except (json.JSONDecodeError, ValidationError):
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start == -1 or end == -1 or start >= end:
            logger.warning("Score parse failed - raw: %s", cleaned[:300])
            return None

        fragment = cleaned[start : end + 1]
        try:
            data = json.loads(fragment)
            return TurnScore(**data)
        except (json.JSONDecodeError, ValidationError) as exc:
            logger.warning("Score parse failed: %s - raw: %s", exc, cleaned[:300])
            return None


def _default_scores() -> dict[str, Any]:
    fallback_scores: dict[str, Any] = {
        dim: {"score": 5, "rationale": "Scoring failed - using default"}
        for dim in _SCORE_DIMS
    }
    fallback_scores["overall_comment"] = "Scoring failed, so a neutral fallback score was used."
    return fallback_scores


async def judge_score(state: dict[str, Any]) -> dict[str, Any]:
    """
    LangGraph node: judge evaluates each debater for the current turn.

    Reads: topic, participants, dialogue_history, shared_knowledge, current_turn, cumulative_scores
    Writes: current_scores, cumulative_scores
    """
    topic = state["topic"]
    participants = state["participants"]
    dialogue_history = state.get("dialogue_history", [])
    shared_knowledge = state.get("shared_knowledge", [])
    current_turn = state.get("current_turn", 0)
    cumulative_scores = dict(state.get("cumulative_scores", {}))

    logger.info("Judge scoring turn %d for %d participants", current_turn + 1, len(participants))

    system_prompt = get_judge_prompt()
    agent_configs = state.get("agent_configs", {})
    override = agent_configs.get("judge")
    current_scores: dict[str, Any] = {}

    for role in participants:
        instruction = _build_judge_instruction(
            topic=topic,
            role_to_judge=role,
            dialogue_history=dialogue_history,
            shared_knowledge=shared_knowledge,
            current_turn=current_turn,
        )

        score: TurnScore | None = None
        for attempt in range(2):
            try:
                response_text = await invoke_text_model(
                    [
                        SystemMessage(content=system_prompt),
                        HumanMessage(content=instruction),
                    ],
                    override=override,
                )
                score = _parse_score_response(response_text)
                if isinstance(score, TurnScore):
                    break
            except Exception as exc:
                logger.warning(
                    "Judge invocation failed for [%s] attempt %d: %s",
                    role,
                    attempt + 1,
                    exc,
                )

            logger.warning("Judge retry for [%s] - attempt %d", role, attempt + 1)

        if isinstance(score, TurnScore):
            score_dict = score.model_dump()
            current_scores[role] = score_dict

            if role not in cumulative_scores:
                cumulative_scores[role] = {dim: [] for dim in _SCORE_DIMS}

            for dim in _SCORE_DIMS:
                dim_data = score_dict.get(dim, {})
                if isinstance(dim_data, dict) and "score" in dim_data:
                    cumulative_scores[role].setdefault(dim, []).append(dim_data["score"])

            logger.info("Judge scored [%s]: avg=%.1f", role, score.average_score)
        else:
            logger.error("Judge failed to score [%s] after retries", role)
            current_scores[role] = _default_scores()

    return {
        "current_scores": current_scores,
        "cumulative_scores": cumulative_scores,
    }
