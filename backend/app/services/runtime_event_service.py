"""Persistence helpers for runtime event history."""

from __future__ import annotations

from typing import Any

from app.storage.session_files import (
    append_runtime_event,
    delete_runtime_events as delete_runtime_events_file,
    get_latest_runtime_event_seq as get_latest_runtime_event_seq_file,
    read_all_runtime_events,
    read_runtime_event_page,
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


async def count_runtime_events(session_id: str) -> int:
    """Return total persisted runtime event count for a session."""
    return len(read_all_runtime_events(session_id))


async def list_runtime_events(
    session_id: str,
    *,
    before_seq: int | None = None,
    limit: int = 200,
) -> dict[str, Any]:
    """Return one history page from events.jsonl, ordered ascending by sequence."""
    page = read_runtime_event_page(
        session_id,
        before_seq=before_seq,
        limit=limit,
    )
    return {
        "events": [_record_to_dict(record) for record in page["events"]],
        "total": int(page["total"]),
        "limit": int(page["limit"]),
        "has_more": bool(page["has_more"]),
        "next_before_seq": page["next_before_seq"],
    }


async def list_all_runtime_events(
    session_id: str,
) -> list[dict[str, Any]]:
    """Return the full persisted runtime history ordered by sequence ascending."""
    return [_record_to_dict(record) for record in read_all_runtime_events(session_id)]


async def delete_runtime_events(session_id: str) -> None:
    """Delete all persisted runtime events for a session."""
    delete_runtime_events_file(session_id)
