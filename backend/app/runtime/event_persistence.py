from __future__ import annotations

from typing import Any

TRANSIENT_EVENT_TYPES = {"speech_token", "speech_start", "projection_snapshot", "progress"}


def compact_runtime_event_payload(payload: dict[str, Any] | None) -> dict[str, Any]:
    compacted = dict(payload) if isinstance(payload, dict) else {}
    for key in ("dialogue_history", "judge_history"):
        if compacted.get(key) == []:
            compacted.pop(key, None)
    return compacted


def should_persist_runtime_event(
    event_type: str,
    payload: dict[str, Any] | None = None,
    *,
    source: str = "",
) -> bool:
    """Return whether a runtime event is worth storing in SQLite.

    Transient UI progress events are still delivered live over WebSocket, but
    they do not help rebuild the debate transcript and can dominate database
    size for long model calls.
    """
    normalized_type = str(event_type or "")
    if normalized_type in TRANSIENT_EVENT_TYPES:
        return False

    payload_dict = payload if isinstance(payload, dict) else {}
    if normalized_type == "status":
        if payload_dict.get("heartbeat") is True:
            return False
        if str(source or "").endswith(".heartbeat"):
            return False
        if any(key in payload_dict for key in ("elapsed_seconds", "waiting_seconds", "progress")):
            return False

    return True
