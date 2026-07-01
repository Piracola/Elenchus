"""Context engineering helpers for runtime prompt assembly."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
import logging

from langchain_core.messages import HumanMessage, SystemMessage

from app.config import get_settings
from app.context_runtime import (
    CONTEXT_INJECTION_MODE_AUTO,
    CONTEXT_INJECTION_PRESETS,
    values_for_context_injection_mode,
)
from app.llm.invoke import invoke_text_model, normalize_model_text

_CONTEXT_HELPER_PROMPT = """
You are a compact context organizer for a debate system.

Rules:
- Reply in Chinese.
- Output only the requested structured note.
- Preserve concrete claims, concessions, unresolved attacks, and evidence needs.
- Do not invent facts that are absent from the source text.
""".strip()

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ContextPolicy:
    recent_turns_to_include: int
    evidence_items_per_agent: int
    exact_recent_entries_per_agent: int
    planning_entries_per_agent: int
    long_term_memory_entries_per_agent: int


@dataclass(frozen=True)
class ContextPacket:
    task_frame: list[str]
    live_constraints: list[str]
    planning_context: list[str]
    exact_recent_context: list[str]
    role_memory: list[str]
    evidence_context: list[str]
    feedback_context: list[str]
    historical_digest: list[str]

    def render(self) -> str:
        sections: list[str] = []
        mapping = [
            ("## Task Frame", self.task_frame),
            ("## Live Constraints", self.live_constraints),
            ("## Current Planning Context", self.planning_context),
            ("## Exact Recent Dialogue", self.exact_recent_context),
            ("## Role Memory", self.role_memory),
            ("## Evidence Context", self.evidence_context),
            ("## Judge Feedback", self.feedback_context),
            ("## Historical Digest", self.historical_digest),
        ]
        for title, lines in mapping:
            cleaned = [line for line in lines if isinstance(line, str) and line.strip()]
            if cleaned:
                sections.append(f"{title}\n" + "\n".join(cleaned))
        return "\n\n".join(sections)


def _auto_context_policy_values(state: dict[str, Any] | None) -> dict[str, int]:
    values = dict(CONTEXT_INJECTION_PRESETS["standard"])
    if not isinstance(state, dict):
        return values

    try:
        current_turn = int(state.get("current_turn", 0) or 0)
    except (TypeError, ValueError):
        current_turn = 0
    try:
        max_turns = int(state.get("max_turns", 5) or 5)
    except (TypeError, ValueError):
        max_turns = 5

    dialogue_entries = _iter_dialogue_entries(state)
    shared_knowledge = state.get("shared_knowledge", [])
    knowledge_entries = shared_knowledge if isinstance(shared_knowledge, list) else []
    evidence_count = sum(
        1
        for entry in knowledge_entries
        if isinstance(entry, dict)
        and str(entry.get("type", "") or "") in {
            "fact",
            "reference_claim",
            "reference_validation",
            "reference_term",
            "reference_summary",
        }
    )
    memory_count = sum(
        1
        for entry in knowledge_entries
        if isinstance(entry, dict)
        and str(entry.get("type", "") or "") in {"memo", "round_digest"}
    )

    is_long_or_late_debate = max_turns >= 8 or current_turn >= 3 or len(dialogue_entries) >= 10
    has_rich_context = evidence_count >= 6 or memory_count >= 4
    is_early_light_debate = current_turn <= 1 and len(dialogue_entries) <= 4 and evidence_count <= 2

    if is_long_or_late_debate or has_rich_context:
        values.update(
            recent_turns_to_include=3,
            evidence_items_per_agent=6,
            exact_recent_entries_per_agent=6,
            planning_entries_per_agent=3,
            long_term_memory_entries_per_agent=6,
        )
    elif is_early_light_debate:
        values.update(
            recent_turns_to_include=1,
            evidence_items_per_agent=3,
            exact_recent_entries_per_agent=4,
            planning_entries_per_agent=2,
            long_term_memory_entries_per_agent=3,
        )

    return values


def get_context_policy(state: dict[str, Any] | None = None) -> ContextPolicy:
    config = get_settings().debate.context_runtime
    mode = str(getattr(config, "context_injection_mode", "auto") or "auto")
    current_values = {
        "recent_turns_to_include": getattr(config, "recent_turns_to_include", None),
        "evidence_items_per_agent": getattr(config, "evidence_items_per_agent", None),
        "exact_recent_entries_per_agent": getattr(config, "exact_recent_entries_per_agent", None),
        "planning_entries_per_agent": getattr(config, "planning_entries_per_agent", None),
        "long_term_memory_entries_per_agent": getattr(config, "long_term_memory_entries_per_agent", None),
    }
    values = (
        _auto_context_policy_values(state)
        if mode == CONTEXT_INJECTION_MODE_AUTO
        else values_for_context_injection_mode(mode, current_values)
    )
    return ContextPolicy(
        recent_turns_to_include=values["recent_turns_to_include"],
        evidence_items_per_agent=values["evidence_items_per_agent"],
        exact_recent_entries_per_agent=values["exact_recent_entries_per_agent"],
        planning_entries_per_agent=values["planning_entries_per_agent"],
        long_term_memory_entries_per_agent=values["long_term_memory_entries_per_agent"],
    )


async def build_context_helper_override() -> dict[str, Any] | None:
    config = get_settings().debate.context_runtime
    provider_id = (config.low_cost_model_provider_id or "").strip()
    model_id = (config.low_cost_model_id or "").strip()
    if not config.use_low_cost_context_model and not provider_id and not model_id:
        return None
    if not provider_id and not model_id:
        return None
    override: dict[str, Any] = {}
    if provider_id:
        override["provider_id"] = provider_id
        if not model_id:
            from app.dependencies import get_agent_config_service

            selection = await get_agent_config_service().resolve_provider_selection(
                {"provider_id": provider_id}
            )
            if selection.default_model:
                model_id = str(selection.default_model)
    if model_id:
        override["model"] = model_id
    return override


def _entry_turn(entry: dict[str, Any]) -> int:
    try:
        return int(entry.get("turn", -1) or -1)
    except (TypeError, ValueError):
        return -1


def _iter_dialogue_entries(state: dict[str, Any]) -> list[dict[str, Any]]:
    dialogue_history = state.get("dialogue_history", [])
    if not isinstance(dialogue_history, list):
        return []
    return [entry for entry in dialogue_history if isinstance(entry, dict)]


def _select_recent_turn_entries(
    state: dict[str, Any],
    *,
    include_roles: set[str] | None = None,
) -> list[dict[str, Any]]:
    entries = _iter_dialogue_entries(state)
    if not entries:
        return []
    current_turn = int(state.get("current_turn", 0) or 0)
    policy = get_context_policy(state)
    turn_floor = max(0, current_turn - policy.recent_turns_to_include + 1)
    selected = [
        entry
        for entry in entries
        if _entry_turn(entry) >= turn_floor
        and (include_roles is None or str(entry.get("role", "") or "") in include_roles)
    ]
    return selected[-policy.exact_recent_entries_per_agent :]


def _select_planning_entries(state: dict[str, Any]) -> list[dict[str, Any]]:
    policy = get_context_policy(state)
    current_turn = int(state.get("current_turn", 0) or 0)
    planning_entries = [
        entry
        for entry in _iter_dialogue_entries(state)
        if str(entry.get("role", "") or "") == "group_discussion"
        and _entry_turn(entry) == current_turn
    ]
    return planning_entries[-policy.planning_entries_per_agent :]


def _select_evidence_entries(state: dict[str, Any]) -> list[dict[str, Any]]:
    policy = get_context_policy(state)
    shared_knowledge = state.get("shared_knowledge", [])
    if not isinstance(shared_knowledge, list):
        return []
    scored: list[tuple[int, dict[str, Any]]] = []
    for entry in shared_knowledge:
        if not isinstance(entry, dict):
            continue
        entry_type = str(entry.get("type", "") or "")
        if entry_type not in {"fact", "reference_claim", "reference_validation", "reference_term", "reference_summary"}:
            continue
        score = 0
        if entry_type == "fact":
            score += 30
        if str(entry.get("source_kind", "") or "") == "reference_document":
            score += 10
        if int(entry.get("importance", 0) or 0):
            score += int(entry.get("importance", 0) or 0)
        if int(entry.get("source_turn", -1) or -1) == int(state.get("current_turn", 0) or 0):
            score += 8
        scored.append((score, entry))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [entry for _, entry in scored[: policy.evidence_items_per_agent]]


def _select_role_memory_entries(state: dict[str, Any], *, role: str) -> list[dict[str, Any]]:
    policy = get_context_policy(state)
    shared_knowledge = state.get("shared_knowledge", [])
    if not isinstance(shared_knowledge, list):
        return []
    selected = [
        entry
        for entry in shared_knowledge
        if isinstance(entry, dict)
        and str(entry.get("type", "") or "") in {"memo", "round_digest"}
        and str(entry.get("source_role", entry.get("role", "")) or "") in {role, "group_discussion"}
    ]
    return selected[-policy.long_term_memory_entries_per_agent :]


def _render_evidence_line(entry: dict[str, Any]) -> str:
    entry_type = str(entry.get("type", "") or "")
    if entry_type == "fact":
        query = str(entry.get("query", "") or "")
        result = str(entry.get("result", "") or "")
        return f"- [Fact] {query}: {result}"
    title = str(entry.get("title", entry.get("document_name", "Evidence")) or "Evidence")
    content = str(entry.get("content", "") or "")
    return f"- [{entry_type}] {title}: {content}"


def _render_memory_line(entry: dict[str, Any]) -> str:
    source_role = str(entry.get("source_role", entry.get("role", "")) or "")
    content = str(entry.get("content", "") or "")
    if str(entry.get("type", "") or "") == "round_digest":
        return f"- [Round Digest / {source_role}] {content}"
    return f"- [Memory / {source_role}] {content}"


def _render_dialogue_line(entry: dict[str, Any]) -> str:
    agent_name = str(entry.get("agent_name", entry.get("role", "unknown")) or "unknown")
    content = str(entry.get("content", "") or "")
    return f"**[{agent_name}]**: {content}"


async def build_round_digest(
    state: dict[str, Any],
    *,
    turn_index: int,
) -> dict[str, Any] | None:
    entries = [
        entry
        for entry in _iter_dialogue_entries(state)
        if _entry_turn(entry) == turn_index and str(entry.get("role", "") or "") != "group_discussion"
    ]
    if not entries:
        return None

    transcript = "\n\n".join(_render_dialogue_line(entry) for entry in entries)
    prompt = (
        f"请把第 {turn_index + 1} 轮辩论整理成结构化短摘要，控制在 180 字以内。\n"
        "要求包含：本轮正方推进点、反方主要攻击点、关键让步或边界修正、仍未解决的问题。\n\n"
        f"{transcript}"
    )
    try:
        context_override = await build_context_helper_override()
        summary = await invoke_text_model(
            [
                SystemMessage(content=_CONTEXT_HELPER_PROMPT),
                HumanMessage(content=prompt),
            ],
            override=context_override,
        )
    except Exception as exc:
        logger.warning("Context round digest generation failed for turn %d: %s", turn_index + 1, exc)
        return None
    return {
        "type": "round_digest",
        "content": normalize_model_text(summary),
        "source_turn": turn_index,
        "source_kind": "round_digest",
    }


def merge_round_digest_knowledge(
    shared_knowledge: list[dict[str, Any]],
    digest_entry: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    if digest_entry is None:
        return list(shared_knowledge)
    next_entries = [
        entry
        for entry in shared_knowledge
        if not (
            isinstance(entry, dict)
            and str(entry.get("type", "") or "") == "round_digest"
            and int(entry.get("source_turn", -1) or -1) == int(digest_entry.get("source_turn", -1) or -1)
        )
    ]
    next_entries.append(digest_entry)
    return next_entries


def build_context_packet(
    state: dict[str, Any],
    *,
    agent_role: str,
    task_lines: list[str],
    live_constraints: list[str] | None = None,
    feedback_lines: list[str] | None = None,
) -> ContextPacket:
    participants = state.get("participants", [])
    participant_roles = {
        str(role)
        for role in participants
        if isinstance(role, str)
    }
    exact_recent_entries = _select_recent_turn_entries(
        state,
        include_roles=participant_roles | {"group_discussion", "audience"},
    )
    planning_entries = _select_planning_entries(state)
    evidence_entries = _select_evidence_entries(state)
    role_memory_entries = _select_role_memory_entries(state, role=agent_role)
    digest_entries = [
        entry
        for entry in state.get("shared_knowledge", [])
        if isinstance(entry, dict) and str(entry.get("type", "") or "") == "round_digest"
    ][-2:]

    return ContextPacket(
        task_frame=list(task_lines),
        live_constraints=list(live_constraints or []),
        planning_context=[_render_dialogue_line(entry) for entry in planning_entries],
        exact_recent_context=[_render_dialogue_line(entry) for entry in exact_recent_entries],
        role_memory=[_render_memory_line(entry) for entry in role_memory_entries],
        evidence_context=[_render_evidence_line(entry) for entry in evidence_entries],
        feedback_context=list(feedback_lines or []),
        historical_digest=[_render_memory_line(entry) for entry in digest_entries],
    )
