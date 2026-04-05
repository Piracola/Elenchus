"""Snapshot normalization logic for session runtime resumption."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from app.text_repair import repair_text_tree

from .session_dialogue_helpers import (
    coerce_int,
    entry_turn,
    knowledge_for_turn,
    recompute_cumulative_scores,
    sanitize_dialogue_history,
)

SAFE_RESUME_NODES = {
    "",
    "manage_context",
    "advance_turn",
    "consensus",
    "sophistry_postmortem",
}


def normalize_resumable_snapshot(
    session_snapshot: dict[str, Any],
    *,
    current_turn: int,
) -> dict[str, Any]:
    snapshot = repair_text_tree(deepcopy(session_snapshot))
    last_node = str(snapshot.get("last_executed_node", "") or "")
    if last_node in SAFE_RESUME_NODES:
        return snapshot

    snapshot["dialogue_history"] = [
        entry
        for entry in sanitize_dialogue_history(snapshot.get("dialogue_history", []))
        if entry_turn(entry) != current_turn
    ]
    snapshot["team_dialogue_history"] = [
        entry
        for entry in sanitize_dialogue_history(snapshot.get("team_dialogue_history", []))
        if entry_turn(entry) != current_turn
    ]
    snapshot["jury_dialogue_history"] = [
        entry
        for entry in sanitize_dialogue_history(snapshot.get("jury_dialogue_history", []))
        if entry_turn(entry) != current_turn
    ]
    snapshot["judge_history"] = [
        entry
        for entry in sanitize_dialogue_history(snapshot.get("judge_history", []))
        if entry_turn(entry) != current_turn
    ]

    shared_knowledge = snapshot.get("shared_knowledge", [])
    if isinstance(shared_knowledge, list):
        current_turn_knowledge = {id(entry) for entry in knowledge_for_turn(shared_knowledge, current_turn)}
        snapshot["shared_knowledge"] = [
            entry
            for entry in shared_knowledge
            if id(entry) not in current_turn_knowledge
        ]
    else:
        snapshot["shared_knowledge"] = []

    mode_artifacts = snapshot.get("mode_artifacts", [])
    if isinstance(mode_artifacts, list):
        snapshot["mode_artifacts"] = [
            artifact
            for artifact in mode_artifacts
            if coerce_int(artifact.get("turn") if isinstance(artifact, dict) else None) != current_turn
        ]
    else:
        snapshot["mode_artifacts"] = []

    current_mode_report = snapshot.get("current_mode_report")
    if isinstance(current_mode_report, dict) and coerce_int(current_mode_report.get("turn")) == current_turn:
        snapshot["current_mode_report"] = None

    snapshot["recent_dialogue_history"] = [
        entry
        for entry in snapshot["dialogue_history"]
        if entry_turn(entry) == current_turn
    ] or snapshot["dialogue_history"]
    snapshot["current_speaker"] = ""
    snapshot["current_speaker_index"] = -1
    snapshot["messages"] = []
    snapshot["current_team_discussion"] = []
    snapshot["current_team_summary"] = None
    snapshot["current_jury_discussion"] = []
    snapshot["current_jury_summary"] = None
    snapshot["current_scores"] = {}
    snapshot["cumulative_scores"] = recompute_cumulative_scores(snapshot["judge_history"])
    snapshot["last_executed_node"] = "manage_context"
    snapshot["last_status_message"] = ""
    return snapshot
