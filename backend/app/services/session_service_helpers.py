from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.llm.invoke import normalize_model_text
from app.models.schemas import DebateMode
from app.text_repair import repair_text_tree


def default_team_config() -> dict[str, int]:
    return {
        "agents_per_team": 0,
        "discussion_rounds": 0,
    }


def default_jury_config() -> dict[str, int]:
    return {
        "agents_per_jury": 0,
        "discussion_rounds": 0,
    }


def default_reasoning_config() -> dict[str, bool]:
    return {
        "steelman_enabled": True,
        "counterfactual_enabled": True,
        "consensus_enabled": True,
    }


def default_mode_config(debate_mode: str) -> dict[str, Any]:
    if debate_mode == DebateMode.SOPHISTRY_EXPERIMENT.value:
        return {
            "seed_reference_enabled": True,
            "observer_enabled": True,
            "artifact_detail_level": "full",
        }
    return {}


def normalize_mode_config(debate_mode: str, value: Any) -> dict[str, Any]:
    base = default_mode_config(debate_mode)
    if isinstance(value, dict):
        base.update(value)
    return base


def effective_configs_for_mode(
    debate_mode: str,
    team_config: dict[str, int],
    jury_config: dict[str, int],
    reasoning_config: dict[str, bool],
) -> tuple[dict[str, int], dict[str, int], dict[str, bool]]:
    if debate_mode != DebateMode.SOPHISTRY_EXPERIMENT.value:
        return team_config, jury_config, reasoning_config

    return (
        default_team_config(),
        default_jury_config(),
        {
            "steelman_enabled": False,
            "counterfactual_enabled": False,
            "consensus_enabled": False,
        },
    )


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


def parse_timestamp(value: Any) -> datetime:
    if not isinstance(value, str) or not value:
        return datetime.min.replace(tzinfo=timezone.utc)

    normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return datetime.min.replace(tzinfo=timezone.utc)

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def coerce_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def entry_turn(entry: Any) -> int | None:
    if not isinstance(entry, dict):
        return None
    return coerce_int(entry.get("turn"))


def entries_for_turn(entries: Any, turn_index: int) -> list[dict[str, Any]]:
    if not isinstance(entries, list):
        return []
    return [
        entry
        for entry in entries
        if isinstance(entry, dict) and entry_turn(entry) == turn_index
    ]


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


def collect_round_timestamps(*collections: list[dict[str, Any]]) -> list[datetime]:
    parsed: list[datetime] = []
    floor = datetime.min.replace(tzinfo=timezone.utc)
    for collection in collections:
        for entry in collection:
            timestamp = entry.get("timestamp") if isinstance(entry, dict) else None
            moment = parse_timestamp(timestamp)
            if moment != floor:
                parsed.append(moment)
    return parsed


def backfill_judge_history_turns(
    dialogue_history: list[dict[str, Any]],
    judge_history: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not judge_history:
        return []

    annotated_dialogue: list[tuple[datetime, int]] = []
    for entry in dialogue_history:
        if not isinstance(entry, dict):
            continue
        turn = coerce_int(entry.get("turn"))
        if turn is None or turn < 0:
            continue
        annotated_dialogue.append((parse_timestamp(entry.get("timestamp")), turn))

    last_known_turn = 0
    normalized_history: list[dict[str, Any]] = []
    for entry in judge_history:
        if not isinstance(entry, dict):
            continue

        normalized_entry = dict(entry)
        explicit_turn = coerce_int(normalized_entry.get("turn"))
        if explicit_turn is not None and explicit_turn >= 0:
            last_known_turn = explicit_turn
            normalized_history.append(normalized_entry)
            continue

        judge_time = parse_timestamp(normalized_entry.get("timestamp"))
        inferred_turn = None
        for dialogue_time, dialogue_turn in annotated_dialogue:
            if dialogue_time <= judge_time:
                inferred_turn = dialogue_turn
            else:
                break

        normalized_entry["turn"] = inferred_turn if inferred_turn is not None else last_known_turn
        last_known_turn = int(normalized_entry["turn"] or 0)
        normalized_history.append(normalized_entry)

    return normalized_history


def sanitize_state_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
    sanitized = repair_text_tree(dict(snapshot))
    dialogue_history = sanitize_dialogue_history(sanitized.get("dialogue_history", []))
    sanitized["dialogue_history"] = dialogue_history
    if "team_dialogue_history" in sanitized:
        sanitized["team_dialogue_history"] = sanitize_dialogue_history(
            sanitized.get("team_dialogue_history", [])
        )
    if "jury_dialogue_history" in sanitized:
        sanitized["jury_dialogue_history"] = sanitize_dialogue_history(
            sanitized.get("jury_dialogue_history", [])
        )
    if "judge_history" in sanitized:
        judge_history = sanitize_dialogue_history(
            sanitized.get("judge_history", [])
        )
        sanitized["judge_history"] = backfill_judge_history_turns(
            dialogue_history,
            judge_history,
        )
    if "recent_dialogue_history" in sanitized:
        sanitized["recent_dialogue_history"] = sanitize_dialogue_history(
            sanitized.get("recent_dialogue_history", [])
        )
    return sanitized


def merge_dialogue_for_display(
    dialogue_history: list[dict[str, Any]],
    judge_history: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    merged = [*dialogue_history, *judge_history]
    merged.sort(
        key=lambda entry: (
            parse_timestamp(entry.get("timestamp")),
            1 if entry.get("role") == "judge" else 0,
        )
    )
    return merged
