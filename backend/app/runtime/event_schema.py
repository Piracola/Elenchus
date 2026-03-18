"""Canonical runtime event schema shared by backend emitters."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, NotRequired, TypedDict
from uuid import uuid4

RUNTIME_EVENT_SCHEMA_VERSION = "2026-03-17"


class RuntimeEvent(TypedDict):
    """Standard event envelope delivered to websocket clients."""

    schema_version: str
    event_id: str
    session_id: str
    seq: int
    timestamp: str
    type: str
    source: str
    payload: dict[str, Any]
    phase: NotRequired[str]


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def build_runtime_event(
    *,
    session_id: str,
    seq: int,
    event_type: str,
    payload: dict[str, Any] | None = None,
    source: str = "runtime",
    phase: str | None = None,
) -> RuntimeEvent:
    """Create a runtime event envelope with backward-compatible flat fields."""
    payload_dict = dict(payload or {})
    event: RuntimeEvent = {
        "schema_version": RUNTIME_EVENT_SCHEMA_VERSION,
        "event_id": f"evt_{uuid4().hex[:12]}",
        "session_id": session_id,
        "seq": seq,
        "timestamp": _utcnow_iso(),
        "type": event_type,
        "source": source,
        "payload": payload_dict,
    }
    if phase:
        event["phase"] = phase

    # Backward compatibility for legacy clients still reading top-level fields.
    for key, value in payload_dict.items():
        if key not in event:
            event[key] = value  # type: ignore[typeddict-unknown-key]

    return event
