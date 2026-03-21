"""
Judge node that evaluates each debater and produces structured scores.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import ValidationError

from app.agents.prompt_loader import get_judge_prompt
from app.agents.runtime_progress import (
    MODEL_HEARTBEAT_INTERVAL_SECONDS,
    MODEL_INVOCATION_TIMEOUT_SECONDS,
    build_status_heartbeat_callback,
)
from app.agents.safe_invoke import invoke_text_model
from app.models.scoring import SCORE_DIMENSION_WEIGHTS, TurnScore

logger = logging.getLogger(__name__)

_SCORE_DIMS = list(SCORE_DIMENSION_WEIGHTS.keys())

_OUTPUT_SCHEMA = {
    "logical_rigor": {"score": 1, "rationale": "Explain the score."},
    "evidence_quality": {"score": 1, "rationale": "Explain the score."},
    "topic_focus": {"score": 1, "rationale": "Explain the score."},
    "rebuttal_strength": {"score": 1, "rationale": "Explain the score."},
    "consistency": {"score": 1, "rationale": "Explain the score."},
    "persuasiveness": {"score": 1, "rationale": "Explain the score."},
    "overall_comment": "One concise summary of the debater's performance.",
}


def _strip_code_fences(text: str) -> str:
    """Remove markdown code fences when the model wraps JSON in a block."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    return cleaned


def _extract_json_fragment(text: str) -> str | None:
    """Extract the outermost JSON object from mixed prose + JSON output."""
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or start >= end:
        return None
    return text[start : end + 1]


def _next_significant_char(text: str, start_index: int) -> str | None:
    """Peek ahead to the next non-whitespace character."""
    for char in text[start_index:]:
        if not char.isspace():
            return char
    return None


def _repair_json_fragment(text: str) -> str:
    """
    Repair common LLM JSON glitches.

    The main failure mode we see in production is otherwise-valid JSON with
    unescaped ASCII double quotes inside rationale strings, for example:
    `"...但"GDP=福祉"这个前提..."`.
    """
    repaired: list[str] = []
    in_string = False
    escaped = False

    for index, char in enumerate(text):
        if not in_string:
            repaired.append(char)
            if char == '"':
                in_string = True
            continue

        if escaped:
            repaired.append(char)
            escaped = False
            continue

        if char == "\\":
            repaired.append(char)
            escaped = True
            continue

        if char == '"':
            next_char = _next_significant_char(text, index + 1)
            if next_char in {",", "}", "]", ":"}:
                repaired.append(char)
                in_string = False
            else:
                repaired.append('\\"')
            continue

        repaired.append(char)

    repaired_text = "".join(repaired)
    return re.sub(r",(\s*[}\]])", r"\1", repaired_text)


def _load_turn_score(text: str) -> TurnScore:
    """Parse one JSON payload and validate it against the TurnScore schema."""
    data = json.loads(text)
    return TurnScore(**data)


def _build_judge_instruction(
    topic: str,
    role_to_judge: str,
    dialogue_history: list[dict[str, Any]],
    shared_knowledge: list[dict[str, Any]],
    current_turn: int,
    jury_summary: dict[str, Any] | None = None,
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

    if isinstance(jury_summary, dict):
        summary_content = jury_summary.get("content", "")
        if isinstance(summary_content, str) and summary_content.strip():
            parts.append("\n## Multi-Perspective Jury Briefing")
            parts.append(
                "Use this as an internal aid only. Consider it critically rather than copying it."
            )
            parts.append(summary_content.strip())

    parts.append(
        "\n## Instructions\n"
        "Score this debater on all 6 atomic dimensions from 1 to 10 and explain each score. "
        "The system will then aggregate them into 4 display modules: foundation "
        "(evidence_quality + topic_focus), confrontation (logical_rigor + rebuttal_strength), "
        "stability (consistency), and vision (persuasiveness), plus one weighted comprehensive score. "
        "Do not output module scores or any extra fields. "
        "Return ONLY valid JSON. Do not include markdown fences, headings, or prose. "
        "If you need to quote a term inside a JSON string, use Chinese quotes like 「」 instead of ASCII double quotes.\n"
        f"## Required JSON Shape\n{json.dumps(_OUTPUT_SCHEMA, ensure_ascii=False, indent=2)}"
    )

    return "\n".join(parts)


def _parse_score_response(text: str) -> TurnScore | None:
    """Parse a judge response into a TurnScore."""
    cleaned = _strip_code_fences(text)
    candidates: list[str] = []
    if cleaned:
        candidates.append(cleaned)

    fragment = _extract_json_fragment(cleaned)
    if fragment and fragment != cleaned:
        candidates.append(fragment)

    last_error: Exception | None = None

    for candidate in candidates:
        try:
            return _load_turn_score(candidate)
        except (json.JSONDecodeError, ValidationError) as exc:
            last_error = exc

        repaired = _repair_json_fragment(candidate)
        if repaired == candidate:
            continue

        try:
            parsed = _load_turn_score(repaired)
            logger.info("Score parse succeeded after JSON repair")
            return parsed
        except (json.JSONDecodeError, ValidationError) as exc:
            last_error = exc

    if last_error is None:
        logger.warning("Score parse failed - raw: %s", cleaned[:300])
    else:
        logger.warning("Score parse failed: %s - raw: %s", last_error, cleaned[:300])
    return None


def _default_scores() -> dict[str, Any]:
    fallback_dimensions: dict[str, Any] = {
        dim: {"score": 5, "rationale": "评分解析失败，已采用中性分"}
        for dim in _SCORE_DIMS
    }
    fallback_dimensions["overall_comment"] = "评分解析失败，本轮暂按中性分处理。"
    return TurnScore(**fallback_dimensions).model_dump()


async def judge_score(state: dict[str, Any]) -> dict[str, Any]:
    """
    LangGraph node: judge evaluates each debater for the current turn.

    Reads: topic, participants, dialogue_history, shared_knowledge, current_turn, cumulative_scores
    Writes: current_scores, cumulative_scores
    """
    topic = state["topic"]
    participants = state["participants"]
    dialogue_history = state.get("dialogue_history", [])
    recent_dialogue_history = state.get("recent_dialogue_history", dialogue_history)
    shared_knowledge = state.get("shared_knowledge", [])
    current_turn = state.get("current_turn", 0)
    cumulative_scores = dict(state.get("cumulative_scores", {}))
    jury_summary = state.get("current_jury_summary")

    logger.info("Judge scoring turn %d for %d participants", current_turn + 1, len(participants))

    system_prompt = get_judge_prompt()
    agent_configs = state.get("agent_configs", {})
    override = agent_configs.get("judge")
    current_scores: dict[str, Any] = {}
    judge_history_entries: list[dict[str, Any]] = []
    progress_callback = build_status_heartbeat_callback(
        state,
        node_name="judge",
        template="裁判仍在评估本轮表现，已等待 {seconds} 秒...",
    )

    participant_set = set(participants)
    preferred_history = (
        recent_dialogue_history if isinstance(recent_dialogue_history, list) else dialogue_history
    )
    evaluation_history = [
        entry
        for entry in preferred_history
        if isinstance(entry, dict) and entry.get("role") in participant_set
    ]
    if not evaluation_history:
        evaluation_history = [
            entry
            for entry in dialogue_history
            if isinstance(entry, dict) and entry.get("role") in participant_set
        ]

    for role in participants:
        instruction = _build_judge_instruction(
            topic=topic,
            role_to_judge=role,
            dialogue_history=evaluation_history,
            shared_knowledge=shared_knowledge,
            current_turn=current_turn,
            jury_summary=jury_summary if isinstance(jury_summary, dict) else None,
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
                    on_progress=progress_callback,
                    timeout_seconds=MODEL_INVOCATION_TIMEOUT_SECONDS,
                    heartbeat_interval_seconds=MODEL_HEARTBEAT_INTERVAL_SECONDS,
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
            score_dict = _default_scores()
            current_scores[role] = score_dict

        judge_history_entries.append(
            {
                "role": "judge",
                "target_role": role,
                "agent_name": "裁判组视角",
                "content": score_dict.get("overall_comment", ""),
                "scores": score_dict,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "citations": [],
                "turn": current_turn,
            }
        )

    return {
        "current_scores": current_scores,
        "cumulative_scores": cumulative_scores,
        "judge_history": judge_history_entries,
    }
