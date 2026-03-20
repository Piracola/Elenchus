"""File-backed persistence for session snapshots, round exports, and runtime events."""

from __future__ import annotations

import json
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any

from app.runtime_paths import get_runtime_paths

_SESSION_WRITE_LOCK = Lock()
_EVENT_WRITE_LOCK = Lock()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _serialize_datetime(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def _parse_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str) and value:
        normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
        try:
            parsed = datetime.fromisoformat(normalized)
        except ValueError:
            return _utcnow()
    else:
        return _utcnow()

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _sessions_root() -> Path:
    root = get_runtime_paths().sessions_dir
    root.mkdir(parents=True, exist_ok=True)
    return root


def session_dir(session_id: str) -> Path:
    return _sessions_root() / session_id


def session_file(session_id: str) -> Path:
    return session_dir(session_id) / "session.json"


def rounds_dir(session_id: str) -> Path:
    return session_dir(session_id) / "rounds"


def round_file(session_id: str, turn_index: int) -> Path:
    return rounds_dir(session_id) / f"round-{turn_index + 1:03d}.json"


def events_file(session_id: str) -> Path:
    return session_dir(session_id) / "events.jsonl"


def _write_text_atomic(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(f"{path.suffix}.tmp")
    temp_path.write_text(content, encoding="utf-8")
    temp_path.replace(path)


def _write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    serialized = json.dumps(payload, ensure_ascii=False, indent=2, default=str)
    _write_text_atomic(path, serialized)


def _read_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


@dataclass(slots=True)
class StoredSessionRecord:
    id: str
    topic: str
    participants: list[str]
    max_turns: int
    current_turn: int
    status: str
    state_snapshot: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime


def _record_to_payload(record: StoredSessionRecord) -> dict[str, Any]:
    return {
        "id": record.id,
        "topic": record.topic,
        "participants": record.participants,
        "max_turns": record.max_turns,
        "current_turn": record.current_turn,
        "status": record.status,
        "state_snapshot": record.state_snapshot or {},
        "created_at": _serialize_datetime(record.created_at),
        "updated_at": _serialize_datetime(record.updated_at),
    }


def _payload_to_record(payload: dict[str, Any]) -> StoredSessionRecord | None:
    session_id = str(payload.get("id", "") or "").strip()
    topic = str(payload.get("topic", "") or "").strip()
    if not session_id or not topic:
        return None

    participants = payload.get("participants")
    state_snapshot = payload.get("state_snapshot")
    return StoredSessionRecord(
        id=session_id,
        topic=topic,
        participants=participants if isinstance(participants, list) else ["proposer", "opposer"],
        max_turns=int(payload.get("max_turns", 5) or 5),
        current_turn=int(payload.get("current_turn", 0) or 0),
        status=str(payload.get("status", "pending") or "pending"),
        state_snapshot=state_snapshot if isinstance(state_snapshot, dict) else {},
        created_at=_parse_datetime(payload.get("created_at")),
        updated_at=_parse_datetime(payload.get("updated_at")),
    )


def write_session_record(record: StoredSessionRecord) -> None:
    with _SESSION_WRITE_LOCK:
        _write_json_atomic(session_file(record.id), _record_to_payload(record))


def read_session_record(session_id: str) -> StoredSessionRecord | None:
    payload = _read_json(session_file(session_id))
    if payload is None:
        return None
    return _payload_to_record(payload)


def list_session_records() -> list[StoredSessionRecord]:
    records: list[StoredSessionRecord] = []
    for path in _sessions_root().glob("*/session.json"):
        payload = _read_json(path)
        if payload is None:
            continue
        record = _payload_to_record(payload)
        if record is not None:
            records.append(record)
    records.sort(key=lambda record: record.created_at, reverse=True)
    return records


def delete_session_storage(session_id: str) -> None:
    shutil.rmtree(session_dir(session_id), ignore_errors=True)


def write_round_result(session_id: str, turn_index: int, payload: dict[str, Any]) -> None:
    with _SESSION_WRITE_LOCK:
        _write_json_atomic(round_file(session_id, turn_index), payload)


def delete_round_results_after(session_id: str, completed_turn_count: int) -> None:
    directory = rounds_dir(session_id)
    if not directory.exists():
        return
    for path in directory.glob("round-*.json"):
        stem = path.stem.removeprefix("round-")
        try:
            round_number = int(stem)
        except ValueError:
            continue
        if round_number > completed_turn_count:
            path.unlink(missing_ok=True)


def append_runtime_event(session_id: str, event: dict[str, Any]) -> None:
    path = events_file(session_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(event, ensure_ascii=False, default=str)
    with _EVENT_WRITE_LOCK:
        with path.open("a", encoding="utf-8", newline="\n") as handle:
            handle.write(serialized)
            handle.write("\n")


def _load_runtime_events(session_id: str) -> list[dict[str, Any]]:
    path = events_file(session_id)
    if not path.exists():
        return []

    events: list[dict[str, Any]] = []
    try:
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                payload = line.strip()
                if not payload:
                    continue
                try:
                    data = json.loads(payload)
                except json.JSONDecodeError:
                    continue
                if isinstance(data, dict):
                    events.append(data)
    except OSError:
        return []

    events.sort(key=lambda item: int(item.get("seq", 0) or 0))
    return events


def read_runtime_event_page(
    session_id: str,
    *,
    before_seq: int | None = None,
    limit: int = 200,
) -> dict[str, Any]:
    all_events = _load_runtime_events(session_id)
    total = len(all_events)
    events = all_events
    if before_seq is not None:
        events = [event for event in all_events if int(event.get("seq", 0) or 0) < before_seq]

    selected = events[-limit:]
    has_more = len(events) > limit
    next_before_seq = int(selected[0].get("seq", 0) or 0) if has_more and selected else None
    return {
        "events": selected,
        "total": total,
        "limit": limit,
        "has_more": has_more,
        "next_before_seq": next_before_seq,
    }


def read_all_runtime_events(session_id: str) -> list[dict[str, Any]]:
    return _load_runtime_events(session_id)


def get_latest_runtime_event_seq(session_id: str) -> int:
    events = _load_runtime_events(session_id)
    if not events:
        return 0
    return int(events[-1].get("seq", 0) or 0)


def delete_runtime_events(session_id: str) -> None:
    events_file(session_id).unlink(missing_ok=True)
