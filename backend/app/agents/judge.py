"""
Judge node — evaluates debaters and produces structured multi-dimensional scores.
Uses Structured Outputs to enforce the TurnScore schema.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import ValidationError

from app.agents.llm import get_judge_llm
from app.agents.prompt_loader import get_judge_prompt
from app.models.scoring import TurnScore

logger = logging.getLogger(__name__)

_SCORE_DIMS = [
    "logical_rigor", "evidence_quality",
    "rebuttal_strength", "consistency", "persuasiveness",
]


def _build_judge_instruction(
    topic: str,
    role_to_judge: str,
    dialogue_history: list[dict[str, Any]],
    shared_knowledge: list[dict[str, Any]],
    current_turn: int,
) -> str:
    """Build the user message for the judge."""
    parts = [
        f"## Task\nScore the **{role_to_judge}** debater for Turn {current_turn + 1}.\n",
        f"## Debate Topic\n{topic}\n",
    ]

    # Full dialogue
    parts.append("## Complete Dialogue History")
    for entry in dialogue_history:
        role = entry.get("role", "")
        content = entry.get("content", "")
        marker = " <- (being judged)" if role == role_to_judge else ""
        parts.append(f"\n### [{role}]{marker}\n{content}")

    # Search context / Shared Knowledge Facts
    facts = [k for k in shared_knowledge if k.get("type", "") == "fact"]
    if facts:
        parts.append("\n## Fact-Check Search Results (use to verify evidence quality)")
        for r in facts:
            parts.append(f"- **Query:** {r.get('query', '')}\n  **Result:** {r.get('result', '')}")

    parts.append(
        "\n## Instructions\n"
        "Score this debater on ALL 5 dimensions (1-10) with rationale. "
        "Include an overall_comment."
    )

    return "\n".join(parts)


def _parse_score_response(text: str) -> TurnScore | None:
    """Try to parse the judge's response into a TurnScore (fallback method)."""
    # Strip markdown code block if present
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    try:
        data = json.loads(cleaned)
        return TurnScore(**data)
    except (json.JSONDecodeError, ValidationError) as exc:
        logger.warning("Score parse failed: %s - raw: %s", exc, cleaned[:300])
        return None


async def judge_score(state: dict[str, Any]) -> dict[str, Any]:
    """
    LangGraph node: Judge evaluates each debater for the current turn.

    Reads: topic, participants, dialogue_history, shared_knowledge, current_turn, cumulative_scores
    Writes: current_scores, cumulative_scores
    """
    topic = state["topic"]
    participants = state["participants"]
    dialogue_history = state.get("dialogue_history", [])
    shared_knowledge = state.get("shared_knowledge", [])
    current_turn = state.get("current_turn", 0)
    cumulative_scores = dict(state.get("cumulative_scores", {}))

    logger.info("Judge scoring Turn %d for %d participants", current_turn + 1, len(participants))

    system_prompt = get_judge_prompt()
    agent_configs = state.get("agent_configs", {})
    override = agent_configs.get("judge")
    base_llm = await get_judge_llm(streaming=False, override=override)

    # Use with_structured_output to enforce TurnScore schema
    structured_llm = base_llm.with_structured_output(TurnScore)

    current_scores: dict[str, Any] = {}

    for role in participants:
        instruction = _build_judge_instruction(
            topic=topic,
            role_to_judge=role,
            dialogue_history=dialogue_history,
            shared_knowledge=shared_knowledge,
            current_turn=current_turn,
        )

        # Attempt scoring with structured output (primary) and text parsing fallback (secondary)
        score: TurnScore | None = None
        for attempt in range(2):
            try:
                # Primary: Use structured output
                result = await structured_llm.ainvoke([
                    SystemMessage(content=system_prompt),
                    HumanMessage(content=instruction),
                ])
                # Check if result is already a TurnScore (OpenAI native support)
                if isinstance(result, TurnScore):
                    score = result
                    break
                # Check if result is a string (some providers don't support structured output)
                if isinstance(result, str):
                    logger.warning("Structured output returned string for [%s], attempting parse", role)
                    score = _parse_score_response(result)
                    if isinstance(score, TurnScore):
                        break
                # Check if result is a dict (some providers return dict instead of Pydantic model)
                if isinstance(result, dict):
                    try:
                        score = TurnScore(**result)
                        break
                    except Exception as dict_exc:
                        logger.warning("Failed to parse dict result for [%s]: %s", role, dict_exc)
                score = None
            except Exception as exc:
                logger.warning("Structured output failed for [%s] attempt %d: %s", role, attempt + 1, exc)
                # Fallback: Try text parsing
                try:
                    response = await base_llm.ainvoke([
                        SystemMessage(content=system_prompt),
                        HumanMessage(content=instruction),
                    ])
                    response_content = response.content if hasattr(response, 'content') else str(response)
                    score = _parse_score_response(response_content)
                    if isinstance(score, TurnScore):
                        break
                except Exception as fallback_exc:
                    logger.error("Fallback parsing also failed for [%s]: %s", role, fallback_exc)
                score = None
            logger.warning("Judge retry for [%s] - attempt %d", role, attempt + 1)

        if isinstance(score, TurnScore):
            score_dict = score.model_dump()
            current_scores[role] = score_dict

            # Update cumulative scores
            if role not in cumulative_scores:
                cumulative_scores[role] = {dim: [] for dim in _SCORE_DIMS}

            for dim in _SCORE_DIMS:
                dim_data = score_dict.get(dim, {})
                if isinstance(dim_data, dict) and "score" in dim_data:
                    cumulative_scores[role].setdefault(dim, []).append(dim_data["score"])

            logger.info(
                "Judge scored [%s]: avg=%.1f",
                role, score.average_score,
            )

        else:
            logger.error("Judge failed to score [%s] after retries", role)
            # Use placeholder scores
            fallback_scores: dict[str, Any] = {
                dim: {"score": 5, "rationale": "Scoring failed - using default"}
                for dim in _SCORE_DIMS
            }
            fallback_scores["overall_comment"] = "评分过程出现错误，使用默认分数。"
            current_scores[role] = fallback_scores

    return {
        "current_scores": current_scores,
        "cumulative_scores": cumulative_scores,
    }
