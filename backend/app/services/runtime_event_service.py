"""Runtime event persistence backed by the SQLite run ledger."""

from __future__ import annotations

from typing import Any

from app.runtime.event_persistence import compact_runtime_event_payload, should_persist_runtime_event
from app.services import run_service
from app.text_repair import repair_text_tree


def _record_to_dict(record: dict[str, Any]) -> dict[str, Any]:
    payload = repair_text_tree(record.get("payload") or {})
    return {
        "schema_version": str(record.get("schema_version", "v2")),
        "event_id": str(record.get("event_id", "")),
        "run_id": str(record.get("run_id", "") or ""),
        "session_id": str(record.get("session_id", "") or ""),
        "seq": int(record.get("seq", -1) or -1),
        "timestamp": record.get("timestamp"),
        "source": str(record.get("source", "runtime")),
        "type": str(record.get("type", "system")),
        "phase": str(record.get("phase")) if record.get("phase") is not None else None,
        "payload": payload if isinstance(payload, dict) else {},
    }


async def create_runtime_event(event: dict[str, Any]) -> dict[str, Any]:
    """Persist one runtime event in the authoritative run ledger."""
    record = _record_to_dict(event)
    record["payload"] = compact_runtime_event_payload(record["payload"])
    run_id = record["run_id"]
    session_id = record["session_id"]
    if not run_id or not session_id:
        return record
    if not should_persist_runtime_event(
        record["type"],
        record["payload"],
        source=record["source"],
    ):
        return record

    return await run_service.append_run_event(
        run_id=run_id,
        session_id=session_id,
        event_type=record["type"],
        payload=record["payload"],
        source=record["source"],
        phase=record["phase"],
        schema_version=record["schema_version"],
        event_id=record["event_id"] or None,
        seq=record["seq"] if record["seq"] >= 0 else None,
        timestamp=record["timestamp"],
    )


async def get_latest_runtime_event_seq(run_id: str) -> int:
    """Return the max persisted sequence for a run, or 0 when empty."""
    return await run_service.get_latest_run_event_seq(run_id)


async def delete_runtime_events(run_id: str) -> None:
    """Delete all persisted runtime events for a run."""
    from app.services.run_ledger_service import RunLedgerService

    await RunLedgerService().clear_run_events(run_id)
