"""
Judge node that evaluates each debater and produces structured scores.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import datetime, timezone
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import ValidationError

from app.agents.context_engine import build_context_packet
from app.agents.live_agent_config import refresh_agent_configs_for_session
from app.agents.prompt_loader import get_judge_prompt
from app.agents.moderator import (
    JUDGE_LIVE_CONSTRAINT,
    render_judge_directive_note,
    select_unanswered_directives,
)
from app.agents.runtime_progress import (
    build_usage_callback,
    MODEL_HEARTBEAT_INTERVAL_SECONDS,
    MODEL_INVOCATION_TIMEOUT_SECONDS,
    build_status_heartbeat_callback,
)
from app.llm.invoke import invoke_text_model
from app.models.scoring import SCORE_DIMENSION_WEIGHTS, TurnScore

logger = logging.getLogger(__name__)

_SCORE_DIMS = list(SCORE_DIMENSION_WEIGHTS.keys())

# Models prompted before the dimension rename may still emit the legacy key.
_LEGACY_DIM_NAME_ALIASES = {"persuasiveness": "boundary_contribution"}

_OUTPUT_SCHEMA = {
    "logical_rigor": {"score": 1, "rationale": "Explain the score."},
    "evidence_quality": {"score": 1, "rationale": "Explain the score."},
    "topic_focus": {"score": 1, "rationale": "Explain the score."},
    "rebuttal_strength": {"score": 1, "rationale": "Explain the score."},
    "consistency": {"score": 1, "rationale": "Explain the score."},
    "boundary_contribution": {"score": 1, "rationale": "Explain the score."},
    "overall_comment": "One concise summary of the debater's performance.",
}


def _entry_turn(entry: dict[str, Any]) -> int:
    value = entry.get("turn")
    try:
        return int(value)
    except (TypeError, ValueError):
        return -1


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
    state: dict[str, Any] | None = None,
) -> str:
    """Build the user message for the judge."""
    state = state or {
        "dialogue_history": dialogue_history,
        "shared_knowledge": shared_knowledge,
        "current_turn": current_turn,
    }
    task_lines = [
        f"辩题：{topic}",
        f"请评估 {role_to_judge} 在第 {current_turn + 1} 轮的表现。",
    ]
    live_constraints = [
        "只根据正式辩手公开发言评分，不参考组内讨论文本进行加分。",
        "若需要判断一致性，请优先依据历史摘要与该辩手本轮发言。",
    ]
    # Moderator directives never enter the scored transcript, so surface them
    # here instead — otherwise the judge cannot tell a debater ignored one.
    directives = select_unanswered_directives(
        state.get("dialogue_history", []),
        state.get("participants", []),
    ) or select_unanswered_directives(dialogue_history, state.get("participants", []))
    directive_note = render_judge_directive_note(directives)
    if directive_note:
        task_lines.append(directive_note)
        live_constraints.append(JUDGE_LIVE_CONSTRAINT)

    packet = build_context_packet(
        state,
        agent_role="judge",
        task_lines=task_lines,
        live_constraints=live_constraints,
    )
    parts = [
        f"## Task\nScore the **{role_to_judge}** debater for turn {current_turn + 1}.\n",
        f"## Debate Topic\n{topic}\n",
        packet.render(),
        "## Current Turn Speeches",
    ]

    # Historical turns are covered by the packet's round digests and recent
    # dialogue excerpts; only the turn being judged needs full text. This keeps
    # the judge prompt bounded instead of growing linearly with the debate.
    current_turn_entries = [
        entry
        for entry in dialogue_history
        if isinstance(entry, dict) and _entry_turn(entry) == current_turn
    ]
    if not current_turn_entries:
        current_turn_entries = [
            entry for entry in dialogue_history if isinstance(entry, dict)
        ][-4:]
    for entry in current_turn_entries:
        role = entry.get("role", "")
        content = entry.get("content", "")
        marker = " <- being judged" if role == role_to_judge else ""
        parts.append(f"\n### [{role}]{marker}\n{content}")

    parts.append(
        "\n## Instructions\n"
        "Score this debater on all 6 atomic dimensions from 1 to 10 and explain each score. "
        "The system will then aggregate them into 4 display modules: foundation "
        "(evidence_quality + topic_focus), confrontation (logical_rigor + rebuttal_strength), "
        "stability (consistency), and vision (boundary_contribution), plus one weighted comprehensive score. "
        "Do not output module scores or any extra fields. "
        "Return ONLY valid JSON. Do not include markdown fences, headings, or prose. "
        "If you need to quote a term inside a JSON string, use Chinese quotes like 「」 instead of ASCII double quotes.\n"
        f"## Required JSON Shape\n{json.dumps(_OUTPUT_SCHEMA, ensure_ascii=False, indent=2)}"
    )

    return "\n".join(parts)


def _parse_score_response(text: str) -> TurnScore | None:
    """Parse a judge response into a TurnScore with progressive fallback."""
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

    # Final fallback: try lenient extraction of key-value pairs
    for candidate in candidates:
        try:
            extracted = _lenient_extract_score(candidate)
            if extracted is not None:
                logger.info("Score parse succeeded after lenient extraction")
                return extracted
        except (json.JSONDecodeError, ValidationError) as exc:
            last_error = exc

    if last_error is None:
        logger.warning("Score parse failed - raw: %s", cleaned[:300])
    else:
        logger.warning("Score parse failed: %s - raw: %s", last_error, cleaned[:300])
    return None


def _lenient_extract_score(text: str) -> TurnScore | None:
    """
    Last-resort parser that extracts dimension scores and overall_comment
    using regex when standard JSON parsing fails entirely.
    """
    import re as _re

    dim_pattern = _re.compile(
        r'"(\w+)"\s*:\s*\{[^}]*"score"\s*:\s*(\d+)[^}]*"rationale"\s*:\s*"([^"]*)"',
        _re.DOTALL,
    )
    overall_pattern = _re.compile(
        r'"overall_comment"\s*:\s*"([^"]*)"', _re.DOTALL
    )

    dimensions: dict[str, Any] = {}
    for match in dim_pattern.finditer(text):
        dim_name = _LEGACY_DIM_NAME_ALIASES.get(match.group(1), match.group(1))
        if dim_name in _SCORE_DIMS:
            dimensions[dim_name] = {
                "score": int(match.group(2)),
                "rationale": match.group(3),
            }

    overall_match = overall_pattern.search(text)
    if overall_match:
        dimensions["overall_comment"] = overall_match.group(1)

    # Only return if we found all core dimensions
    found_dims = set(dimensions.keys()) & set(_SCORE_DIMS)
    if len(found_dims) < len(_SCORE_DIMS):
        return None

    if "overall_comment" not in dimensions:
        dimensions["overall_comment"] = "宽松解析回退评语。"

    return TurnScore(**dimensions)


def _default_scores() -> dict[str, Any]:
    fallback_dimensions: dict[str, Any] = {
        dim: {"score": 5, "rationale": "评分解析失败，已采用中性分"}
        for dim in _SCORE_DIMS
    }
    fallback_dimensions["overall_comment"] = "评分解析失败，本轮暂按中性分处理。"
    payload = TurnScore(**fallback_dimensions).model_dump()
    # Machine-readable marker so events, exports, and the UI can distinguish
    # a real neutral score from a parsing failure.
    payload["parse_failed"] = True
    return payload


async def _score_participant(
    *,
    topic: str,
    role: str,
    dialogue_history: list[dict[str, Any]],
    shared_knowledge: list[dict[str, Any]],
    current_turn: int,
    system_prompt: str,
    override: dict[str, Any] | None,
    progress_callback,
    state: dict[str, Any],
) -> TurnScore | None:
    instruction = _build_judge_instruction(
        topic=topic,
        role_to_judge=role,
        dialogue_history=dialogue_history,
        shared_knowledge=shared_knowledge,
        current_turn=current_turn,
        state=state,
    )

    usage_callback = build_usage_callback(state, node_name="judge", role=role)
    for attempt in range(2):
        try:
            response_text = await invoke_text_model(
                [
                    SystemMessage(content=system_prompt),
                    HumanMessage(content=instruction),
                ],
                override=override,
                on_progress=progress_callback,
                on_usage=usage_callback,
                timeout_seconds=MODEL_INVOCATION_TIMEOUT_SECONDS,
                heartbeat_interval_seconds=MODEL_HEARTBEAT_INTERVAL_SECONDS,
            )
            score = _parse_score_response(response_text)
            if isinstance(score, TurnScore):
                return score
        except Exception as exc:
            logger.warning(
                "Judge invocation failed for [%s] attempt %d: %s",
                role,
                attempt + 1,
                exc,
            )

        logger.warning("Judge retry for [%s] - attempt %d", role, attempt + 1)

    return None


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
    agent_configs = await refresh_agent_configs_for_session(state)
    override = agent_configs.get("judge")
    current_scores: dict[str, Any] = {}
    judge_history_entries: list[dict[str, Any]] = []
    progress_callback = build_status_heartbeat_callback(
        state,
        node_name="judge",
        template="裁判仍在评估本轮表现，已等待 {seconds} 秒...",
    )

    participant_set = set(participants)
    evaluation_history = [
        entry
        for entry in dialogue_history
        if isinstance(entry, dict) and entry.get("role") in participant_set
    ]

    score_results = await asyncio.gather(
        *[
            _score_participant(
                topic=topic,
                role=role,
                dialogue_history=evaluation_history,
                shared_knowledge=shared_knowledge,
                current_turn=current_turn,
                system_prompt=system_prompt,
                override=override,
                progress_callback=progress_callback,
                state=state,
            )
            for role in participants
        ]
    )

    for role, score in zip(participants, score_results, strict=False):
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

            # Keep every dimension list aligned across turns: a parse failure
            # records None so downstream per-round series don't shift rounds.
            if role not in cumulative_scores:
                cumulative_scores[role] = {dim: [] for dim in _SCORE_DIMS}
            for dim in _SCORE_DIMS:
                cumulative_scores[role].setdefault(dim, []).append(None)

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
        "agent_configs": agent_configs,
    }
