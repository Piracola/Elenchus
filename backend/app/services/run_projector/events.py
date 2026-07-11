from __future__ import annotations

from typing import Any

from app.models.ledger import RunEventRecord
from app.models.schemas import RunStatus
from app.services.session_service_helpers import sanitize_state_snapshot


def append_dialogue(projection: dict[str, Any], entry: dict[str, Any]) -> None:
    history = projection.get("dialogue_history")
    if not isinstance(history, list):
        history = []
    event_id = str(entry.get("event_id", "") or "")
    if event_id and any(isinstance(item, dict) and item.get("event_id") == event_id for item in history):
        projection["dialogue_history"] = history
        return
    history.append(entry)
    projection["dialogue_history"] = history


def append_shared_knowledge(projection: dict[str, Any], item: dict[str, Any]) -> None:
    knowledge = projection.get("shared_knowledge")
    if not isinstance(knowledge, list):
        knowledge = []
    knowledge.append(item)
    projection["shared_knowledge"] = knowledge


def dialogue_entry_from_payload(payload: dict[str, Any], event: RunEventRecord) -> dict[str, Any]:
    entry = payload.get("entry") if isinstance(payload.get("entry"), dict) else None
    if entry is not None:
        return {**entry, "event_id": entry.get("event_id") or event.id}
    return {
        "role": payload.get("role") or payload.get("agent_role") or event.type,
        "agent_name": payload.get("agent_name", ""),
        "content": payload.get("content") or payload.get("message") or "",
        "citations": payload.get("citations", []),
        "timestamp": payload.get("timestamp") or event.created_at.isoformat(),
        "turn": payload.get("turn"),
        "event_id": event.id,
        **({"metadata": payload["metadata"]} if isinstance(payload.get("metadata"), dict) else {}),
        **({"discussion_kind": payload["discussion_kind"]} if payload.get("discussion_kind") else {}),
        **({"discussion_round": payload["discussion_round"]} if "discussion_round" in payload else {}),
        **({"source_turn": payload["source_turn"]} if "source_turn" in payload else {}),
        **({"source_roles": payload["source_roles"]} if "source_roles" in payload else {}),
    }


def apply_event_to_projection(projection: dict[str, Any], event: RunEventRecord) -> None:
    payload = event.payload if isinstance(event.payload, dict) else {}
    event_type = str(event.type or "")
    if event_type == "run_created":
        for key in (
            "topic",
            "participants",
            "max_turns",
            "agent_configs",
            "debate_mode",
            "mode_config",
            "reasoning_config",
            "speech_config",
        ):
            if key in payload:
                projection[key] = payload[key]
        return

    if event_type == "projection_snapshot":
        snapshot = payload.get("state_snapshot")
        if not isinstance(snapshot, dict):
            snapshot = payload
        projection.update(sanitize_state_snapshot(snapshot))
        return

    if event_type == "status":
        projection["last_status_message"] = str(payload.get("content", "") or "")
        projection["last_executed_node"] = str(payload.get("node", "") or projection.get("last_executed_node", ""))
        projection["last_progress_at"] = event.created_at.isoformat()
        return

    if event_type == "debate_complete":
        projection["last_status_message"] = "辩论已完成"
        projection["cumulative_scores"] = payload.get("final_scores", projection.get("cumulative_scores", {}))
        if isinstance(payload.get("final_report"), dict):
            projection["final_mode_report"] = payload["final_report"]
        return

    if event_type == "run_status_changed":
        status = str(payload.get("status", "") or "")
        projection["last_status_message"] = str(
            payload.get("content", "") or projection.get("last_status_message", "") or ""
        )
        if status in {RunStatus.FAILED.value, RunStatus.STALLED.value, RunStatus.CANCELLED.value}:
            projection["interrupted_at"] = event.created_at.isoformat()
        return

    if event_type == "error":
        projection["error"] = str(payload.get("content", "") or "")
        return

    if event_type in {"speech_end", "group_discussion", "consensus_summary", "audience_message"}:
        append_dialogue(projection, dialogue_entry_from_payload(payload, event))
        return

    if event_type in {"sophistry_round_report", "sophistry_final_report"}:
        append_dialogue(projection, dialogue_entry_from_payload(payload, event))
        report = payload.get("report")
        if isinstance(report, dict):
            artifacts = projection.get("mode_artifacts")
            if not isinstance(artifacts, list):
                artifacts = []
            artifacts.append(report)
            projection["mode_artifacts"] = artifacts
            if event_type == "sophistry_round_report":
                projection["current_mode_report"] = report
            else:
                projection["final_mode_report"] = report
        return

    if event_type == "judge_score":
        role = str(payload.get("role", "") or "")
        scores = payload.get("scores")
        if role and isinstance(scores, dict):
            current_scores = projection.get("current_scores")
            if not isinstance(current_scores, dict):
                current_scores = {}
            current_scores[role] = scores
            projection["current_scores"] = current_scores
            append_dialogue(
                projection,
                {
                    "role": "judge",
                    "target_role": role,
                    "agent_name": "裁判组视角",
                    "content": scores.get("overall_comment", ""),
                    "scores": scores,
                    "timestamp": event.created_at.isoformat(),
                    "citations": [],
                    "event_id": event.id,
                    "turn": payload.get("turn"),
                },
            )
        return

    if event_type == "turn_complete":
        if "turn" in payload:
            projection["current_turn"] = payload.get("turn")
        if isinstance(payload.get("current_scores"), dict):
            projection["current_scores"] = payload["current_scores"]
        if isinstance(payload.get("cumulative_scores"), dict):
            projection["cumulative_scores"] = payload["cumulative_scores"]
        return

    if event_type == "memory_write":
        memory = payload.get("memory")
        if isinstance(memory, dict):
            append_shared_knowledge(projection, memory)
        return

    if event_type in {"memory_update", "shared_knowledge"}:
        items = payload.get("items")
        if isinstance(items, list):
            for item in items:
                if isinstance(item, dict):
                    append_shared_knowledge(projection, item)
        elif isinstance(payload.get("item"), dict):
            append_shared_knowledge(projection, payload["item"])
