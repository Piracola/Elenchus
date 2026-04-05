"""Dialogue history sanitization and helper functions for session runtime."""

from __future__ import annotations

from typing import Any

from app.agents.safe_invoke import normalize_model_text
from app.text_repair import repair_text_tree


def sanitize_dialogue_history(dialogue_history: Any) -> list[dict[str, Any]]:
    if not isinstance(dialogue_history, list):
        return []

    sanitized: list[dict[str, Any]] = []
    for entry in dialogue_history:
        if not isinstance(entry, dict):
            continue

        normalized_entry = repair_text_tree(dict(entry))
        content = normalized_entry.get("content")
        if isinstance(content, str) and content:
            normalized_entry["content"] = normalize_model_text(content)
        sanitized.append(normalized_entry)

    return sanitized


def coerce_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def entry_turn(entry: Any) -> int | None:
    if not isinstance(entry, dict):
        return None
    return coerce_int(entry.get("turn"))


def knowledge_for_turn(entries: Any, turn_index: int) -> list[dict[str, Any]]:
    if not isinstance(entries, list):
        return []

    selected: list[dict[str, Any]] = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        source_turn = coerce_int(entry.get("source_turn"))
        if source_turn is None:
            source_turn = coerce_int(entry.get("turn"))
        if source_turn == turn_index:
            selected.append(entry)
    return selected


def rebuild_recent_dialogue_history(dialogue_history: list[dict[str, Any]], current_turn: int) -> list[dict[str, Any]]:
    recent_entries = [entry for entry in dialogue_history if entry_turn(entry) == current_turn]
    return recent_entries or dialogue_history


def recompute_cumulative_scores(judge_history: list[dict[str, Any]]) -> dict[str, dict[str, list[Any]]]:
    cumulative_scores: dict[str, dict[str, list[Any]]] = {}
    for entry in judge_history:
        if not isinstance(entry, dict):
            continue
        target_role = str(entry.get("target_role", "") or "")
        scores = entry.get("scores")
        if not target_role or not isinstance(scores, dict):
            continue
        role_scores = cumulative_scores.setdefault(target_role, {})
        for dimension, dimension_data in scores.items():
            if dimension in {"overall_comment", "module_scores", "comprehensive_score"}:
                continue
            if not isinstance(dimension_data, dict):
                continue
            score_value = dimension_data.get("score")
            if isinstance(score_value, (int, float)):
                role_scores.setdefault(str(dimension), []).append(score_value)
    return cumulative_scores
