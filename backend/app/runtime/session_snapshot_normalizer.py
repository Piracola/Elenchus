"""Snapshot normalization logic for session runtime resumption."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from app.text_repair import repair_text_tree
from .runtime_status import predict_resume_next_node

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

RESUME_STRATEGY_KEEP_CURRENT_TURN = {
    "group_discussion",
    "set_speaker",
    "speaker",
    "tool_executor",
    "fact_check",
    "judge",
    "sophistry_speaker",
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

    resume_next_node = predict_resume_next_node(last_node, snapshot)
    if resume_next_node and last_node in RESUME_STRATEGY_KEEP_CURRENT_TURN:
        snapshot["resume_next_node"] = resume_next_node
        snapshot["resume_origin_turn"] = current_turn
        if resume_next_node not in {"tool_executor", "speaker"}:
            snapshot["messages"] = []
        if last_node == "group_discussion":
            snapshot["current_speaker"] = ""
            snapshot["current_speaker_index"] = -1
        elif last_node in {"fact_check", "judge", "sophistry_observer"}:
            snapshot["current_speaker"] = ""
            snapshot["current_speaker_index"] = -1
        return snapshot

    snapshot["dialogue_history"] = [
        entry
        for entry in sanitize_dialogue_history(snapshot.get("dialogue_history", []))
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

    snapshot["current_speaker"] = ""
    snapshot["current_speaker_index"] = -1
    snapshot["messages"] = []
    snapshot["current_scores"] = {}
    snapshot["cumulative_scores"] = recompute_cumulative_scores(snapshot["judge_history"])
    snapshot["last_executed_node"] = "manage_context"
    snapshot["last_status_message"] = ""
    return snapshot
