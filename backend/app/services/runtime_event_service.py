"""Persistence helpers for runtime event history."""

from __future__ import annotations

from typing import Any

from app.storage.session_files import (
    append_runtime_event,
    delete_runtime_events as delete_runtime_events_file,
    get_latest_runtime_event_seq as get_latest_runtime_event_seq_file,
)
from app.text_repair import repair_text_tree


def _record_to_dict(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema_version": str(record.get("schema_version", "legacy")),
        "event_id": str(record.get("event_id", "")),
        "session_id": str(record.get("session_id", "")),
        "seq": int(record.get("seq", -1) or -1),
        "timestamp": str(record.get("timestamp", "")),
        "source": str(record.get("source", "runtime")),
        "type": str(record.get("type", "system")),
        "phase": str(record.get("phase")) if record.get("phase") is not None else None,
        "payload": repair_text_tree(record.get("payload") or {}),
    }


async def create_runtime_event(
    event: dict[str, Any],
) -> dict[str, Any]:
    """Persist a single runtime event envelope to events.jsonl."""
    record = _record_to_dict(event)
    append_runtime_event(record["session_id"], record)
    return record


async def get_latest_runtime_event_seq(session_id: str) -> int:
    """Return the max persisted sequence for a session, or 0 when empty."""
    return get_latest_runtime_event_seq_file(session_id)


async def delete_runtime_events(session_id: str) -> None:
    """Delete all persisted runtime events for a session."""
    delete_runtime_events_file(session_id)
