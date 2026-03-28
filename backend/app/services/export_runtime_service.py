from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

_RUNTIME_SNAPSHOT_VERSION = "runtime-events.v1"


def _stable_serialize(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, (int, float, bool)):
        return str(value).lower() if isinstance(value, bool) else str(value)
    if isinstance(value, list):
        return f"[{','.join(_stable_serialize(item) for item in value)}]"
    if isinstance(value, dict):
        entries = []
        for key, item in sorted(value.items(), key=lambda pair: str(pair[0])):
            encoded_key = json.dumps(str(key), ensure_ascii=False)
            entries.append(f"{encoded_key}:{_stable_serialize(item)}")
        return f"{{{','.join(entries)}}}"
    return json.dumps(str(value), ensure_ascii=False)


def _fnv1a32(value: str) -> str:
    hash_value = 0x811C9DC5
    for char in value:
        hash_value ^= ord(char)
        hash_value = (hash_value * 0x01000193) & 0xFFFFFFFF
    return f"{hash_value:08x}"


def compute_runtime_events_checksum(events: list[dict[str, Any]]) -> str:
    canonical = "|".join(
        _stable_serialize(
            [
                event.get("schema_version"),
                event.get("event_id"),
                event.get("session_id"),
                event.get("seq"),
                event.get("timestamp"),
                event.get("source"),
                event.get("type"),
                event.get("phase"),
                event.get("payload", {}),
            ]
        )
        for event in events
    )
    return f"fnv1a32-{_fnv1a32(canonical)}-{len(events)}"


def export_runtime_events_snapshot(events: list[dict[str, Any]]) -> str:
    snapshot = {
        "version": _RUNTIME_SNAPSHOT_VERSION,
        "exported_at": datetime.now(UTC).isoformat(),
        "event_count": len(events),
        "trajectory_checksum": compute_runtime_events_checksum(events),
        "events": events,
    }
    return json.dumps(snapshot, ensure_ascii=False, indent=2, default=str)
