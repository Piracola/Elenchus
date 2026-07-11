from __future__ import annotations

from datetime import datetime
from typing import Any
import asyncio

from app.models.schemas import RunCommandType, RunStatus
from app.services.run_ledger_service import RunLedgerService
from app.services.run_projector_service import RunProjectorService

_ledger = RunLedgerService()
_projector = RunProjectorService()
_INTERNAL_EVENT_TYPES = {"run_created", "projection_snapshot"}
_event_locks: dict[str, asyncio.Lock] = {}


def _get_event_lock(run_id: str) -> asyncio.Lock:
    lock = _event_locks.get(run_id)
    if lock is None:
        lock = asyncio.Lock()
        _event_locks[run_id] = lock
    return lock


async def create_run(
    session_id: str,
    *,
    topic: str,
    participants: list[str],
    max_turns: int,
    agent_configs: dict[str, Any] | None = None,
) -> dict[str, Any]:
    created = await _ledger.create_run(
        session_id,
        topic=topic,
        participants=participants,
        max_turns=max_turns,
        agent_configs=agent_configs,
    )
    projection = await _projector.initialize_projection(created["run"]["id"])
    if projection is not None:
        created["projection"] = projection.projection
    return created


async def get_run(run_id: str):
    return await _ledger.get_run(run_id)


def serialize_run_summary(run_record: Any) -> dict[str, Any]:
    return {
        "id": run_record.id,
        "session_id": run_record.session_id,
        "status": run_record.status,
        "current_turn": run_record.current_turn,
        "latest_seq": run_record.latest_seq,
        "last_status_message": run_record.last_status_message or "",
        "last_error_message": run_record.last_error_message,
        "started_at": run_record.started_at,
        "completed_at": run_record.completed_at,
        "interrupted_at": run_record.interrupted_at,
        "last_progress_at": run_record.last_progress_at,
        "created_at": run_record.created_at,
        "updated_at": run_record.updated_at,
    }


async def get_run_start_payload(run_id: str) -> dict[str, Any] | None:
    return await _ledger.get_run_start_payload(run_id)


async def get_run_projection(run_id: str):
    projection = await _ledger.get_run_projection(run_id)
    if projection is not None:
        return projection
    return await _projector.rebuild_projection(run_id)


async def get_session_for_run(run_id: str) -> dict[str, Any] | None:
    projection = await get_run_projection(run_id)
    if projection is None:
        return None
    return await _ledger.get_session_for_run(run_id)


async def get_latest_run(session_id: str):
    return await _ledger.get_latest_run(session_id)


async def list_run_events(
    run_id: str,
    *,
    after_seq: int = 0,
    up_to_seq: int | None = None,
) -> list[dict[str, Any]]:
    events = await _ledger.list_run_events(run_id, after_seq=after_seq, up_to_seq=up_to_seq)
    return [
        event
        for event in events
        if int(event.get("seq", 0) or 0) > 0 and str(event.get("type", "")) not in _INTERNAL_EVENT_TYPES
    ]


async def append_run_event(
    *,
    run_id: str,
    session_id: str,
    event_type: str,
    payload: dict[str, Any] | None = None,
    source: str = "runtime",
    phase: str | None = None,
    schema_version: str = "v2",
    event_id: str | None = None,
    seq: int | None = None,
    timestamp: datetime | str | None = None,
) -> dict[str, Any]:
    async with _get_event_lock(run_id):
        event = await _ledger.append_run_event(
            run_id=run_id,
            session_id=session_id,
            event_type=event_type,
            payload=payload,
            source=source,
            phase=phase,
            schema_version=schema_version,
            event_id=event_id,
            seq=seq,
            timestamp=timestamp,
        )
    await _projector.apply_event(run_id)
    return event


async def get_latest_run_event_seq(run_id: str) -> int:
    return await _ledger.get_latest_run_event_seq(run_id)


async def export_payload(session_id: str, *, run_id: str | None = None) -> dict[str, Any] | None:
    return await _projector.export_payload(session_id, run_id=run_id)


async def update_run_state(
    run_id: str,
    *,
    current_turn: int | None = None,
    status: str | None = None,
    status_message: str | None = None,
    error_message: str | None = None,
    state_snapshot: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    summary = await _ledger.update_run_metadata(
        run_id,
        current_turn=current_turn,
        status=status,
        status_message=status_message,
        error_message=error_message,
    )
    if summary is None:
        return None
    if state_snapshot is not None:
        await _projector.apply_snapshot(run_id, state_snapshot)
    else:
        await _projector.rebuild_projection(run_id)
    return summary


async def emit_run_status_changed(
    *,
    run_id: str,
    session_id: str,
    status: str,
    message: str,
    source: str,
) -> dict[str, Any]:
    phase = "processing"
    if status in {RunStatus.FAILED.value, RunStatus.STALLED.value}:
        phase = "error"
    elif status in {RunStatus.COMPLETED.value}:
        phase = "complete"
    elif status in {RunStatus.CANCELLED.value, RunStatus.PENDING.value}:
        phase = "idle"

    event = await append_run_event(
        run_id=run_id,
        session_id=session_id,
        event_type="run_status_changed",
        payload={
            "status": status,
            "content": message,
        },
        source=source,
        phase=phase,
    )
    return event


async def transition_run_to_status(
    run_id: str,
    *,
    status: RunStatus,
    reason: str,
    source: str,
    error_message: str | None = None,
) -> dict[str, Any] | None:
    summary = await update_run_state(
        run_id,
        status=status.value,
        status_message=reason,
        error_message=error_message,
    )
    if summary is None:
        return None
    await emit_run_status_changed(
        run_id=run_id,
        session_id=summary["session_id"],
        status=status.value,
        message=reason,
        source=source,
    )
    refreshed = await _ledger.get_run(run_id)
    return serialize_run_summary(refreshed) if refreshed is not None else summary


async def transition_run_to_terminal_status(
    run_id: str,
    *,
    status: RunStatus,
    reason: str,
    source: str,
    error_message: str | None = None,
) -> dict[str, Any] | None:
    return await transition_run_to_status(
        run_id,
        status=status,
        reason=reason,
        source=source,
        error_message=error_message,
    )


async def transition_run_to_stalled(
    run_id: str,
    *,
    reason: str,
    source: str,
) -> dict[str, Any] | None:
    return await transition_run_to_terminal_status(
        run_id,
        status=RunStatus.STALLED,
        reason=reason,
        source=source,
    )


async def transition_run_to_cancelled(
    run_id: str,
    *,
    reason: str,
    source: str,
) -> dict[str, Any] | None:
    return await transition_run_to_terminal_status(
        run_id,
        status=RunStatus.CANCELLED,
        reason=reason,
        source=source,
    )


async def list_inconsistent_nonterminal_run_ids() -> list[str]:
    return await _ledger.list_nonterminal_run_ids()


async def create_checkpoint(
    *,
    run_id: str,
    session_id: str,
    checkpoint_kind: str,
    node: str,
    seq: int,
    turn: int,
    state_snapshot: dict[str, Any],
) -> dict[str, Any]:
    return await _ledger.create_checkpoint(
        run_id=run_id,
        session_id=session_id,
        checkpoint_kind=checkpoint_kind,
        node=node,
        seq=seq,
        turn=turn,
        state_snapshot=state_snapshot,
    )


async def record_command(
    *,
    run_id: str,
    session_id: str,
    command_type: RunCommandType,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return await _ledger.record_command(
        run_id=run_id,
        session_id=session_id,
        command_type=command_type,
        payload=payload,
    )
