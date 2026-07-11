from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.models.ledger import RunEventRecord, RunProjectionRecord, RunRecord
from app.models.schemas import RunStatus, SessionStatus
from app.services.session_service_helpers import sanitize_state_snapshot


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def serialize_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def parse_datetime_like(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return serialize_datetime(value)
    if isinstance(value, str) and value:
        normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
        try:
            parsed = datetime.fromisoformat(normalized)
        except ValueError:
            return None
        return serialize_datetime(parsed)
    return None


def session_status_from_run(run_status: str | None) -> str:
    mapping = {
        RunStatus.PENDING.value: SessionStatus.PENDING.value,
        RunStatus.INITIALIZING.value: SessionStatus.IN_PROGRESS.value,
        RunStatus.RUNNING.value: SessionStatus.IN_PROGRESS.value,
        RunStatus.RETRYING.value: SessionStatus.IN_PROGRESS.value,
        RunStatus.RECOVERING.value: SessionStatus.IN_PROGRESS.value,
        RunStatus.STOPPING.value: SessionStatus.IN_PROGRESS.value,
        RunStatus.STALLED.value: SessionStatus.PENDING.value,
        RunStatus.COMPLETED.value: SessionStatus.COMPLETED.value,
        RunStatus.FAILED.value: SessionStatus.ERROR.value,
        RunStatus.CANCELLED.value: SessionStatus.PENDING.value,
    }
    return mapping.get(str(run_status or ""), SessionStatus.PENDING.value)


def sync_projection_record(
    projection: RunProjectionRecord,
    run: RunRecord,
    projected_data: dict[str, Any],
) -> None:
    projection.projection = projected_data
    projection.status = run.status
    projection.current_turn = run.current_turn
    projection.node = str(projected_data.get("last_executed_node", "") or "")
    projection.status_message = str(projected_data.get("last_status_message", "") or "")
    projection.updated_at = utcnow()
    projection.version += 1

    run.last_status_message = projection.status_message
    error_message = projected_data.get("error")
    run.last_error_message = str(error_message) if error_message else None
    run.last_progress_at = parse_datetime_like(projected_data.get("last_progress_at"))
    interrupted_at = parse_datetime_like(projected_data.get("interrupted_at"))
    if interrupted_at is not None:
        run.interrupted_at = interrupted_at


def event_to_dict(record: RunEventRecord) -> dict[str, Any]:
    return {
        "schema_version": record.schema_version,
        "event_id": record.id,
        "run_id": record.run_id,
        "session_id": record.session_id,
        "seq": record.seq,
        "timestamp": record.created_at,
        "source": record.source,
        "type": record.type,
        "phase": record.phase,
        "payload": sanitize_state_snapshot(record.payload) if isinstance(record.payload, dict) else {},
    }
