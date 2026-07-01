from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from app.models.schemas import (
    RunCommandAck,
    RunCommandRequest,
    RunCreate,
    RunProjectionResponse,
    RunSummary,
    RunStatus,
)
from app.services import session_service
from app.services.run_service import (
    create_run,
    get_run,
    get_run_projection,
    get_session_for_run,
    list_run_events,
    record_command,
    update_run_state,
)
from app.dependencies import get_debate_runtime_service

router = APIRouter(tags=["runs"])

_TERMINAL_NON_RESUMABLE_RUN_STATUSES = {RunStatus.COMPLETED.value}
_STOPPABLE_RUN_STATUSES = {
    RunStatus.INITIALIZING.value,
    RunStatus.RUNNING.value,
    RunStatus.RETRYING.value,
    RunStatus.RECOVERING.value,
    RunStatus.STOPPING.value,
}


@router.post("/sessions/{session_id}/runs", response_model=RunSummary, include_in_schema=False)
async def start_run(
    session_id: str,
    body: RunCreate | None = None,
):
    session_record = await session_service.get_session_record(session_id)
    if session_record is None:
        raise HTTPException(status_code=404, detail="Session not found")

    topic = (body.topic if body and body.topic is not None else session_record.topic).strip()
    participants = body.participants if body and body.participants is not None else session_record.participants
    max_turns = body.max_turns if body and body.max_turns is not None else session_record.max_turns
    created = await create_run(
        session_id,
        topic=topic,
        participants=participants,
        max_turns=max_turns,
        agent_configs=session_record.agent_configs or {},
    )
    run = created["run"]
    updated = await update_run_state(run["id"], status="initializing")
    if updated is not None:
        run = updated
    runtime_service = get_debate_runtime_service()
    result = await runtime_service.start_run(run["id"])
    if not result.started:
        await update_run_state(run["id"], status="failed")
        raise HTTPException(status_code=409, detail=result.message or "Run could not be started.")
    return RunSummary(**run)


@router.get("/runs/{run_id}", response_model=RunProjectionResponse, include_in_schema=False)
async def get_run_detail(run_id: str):
    runtime_service = get_debate_runtime_service()
    await runtime_service.reconcile_run_liveness(run_id)
    run_record = await get_run(run_id)
    if run_record is None:
        raise HTTPException(status_code=404, detail="Run not found")
    projection = await get_run_projection(run_id)
    if projection is None:
        raise HTTPException(status_code=404, detail="Run projection not found")
    session = await get_session_for_run(run_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return RunProjectionResponse(
        run=RunSummary(
            id=run_record.id,
            session_id=run_record.session_id,
            status=run_record.status,
            current_turn=run_record.current_turn,
            latest_seq=run_record.latest_seq,
            last_status_message=run_record.last_status_message,
            last_error_message=run_record.last_error_message,
            started_at=run_record.started_at,
            completed_at=run_record.completed_at,
            interrupted_at=run_record.interrupted_at,
            last_progress_at=run_record.last_progress_at,
            created_at=run_record.created_at,
            updated_at=run_record.updated_at,
        ),
        session=session,
        projection=projection.projection,
    )


@router.get("/runs/{run_id}/events", include_in_schema=False)
async def get_run_events(
    run_id: str,
    after_seq: int = Query(default=0, ge=0),
):
    runtime_service = get_debate_runtime_service()
    await runtime_service.reconcile_run_liveness(run_id)
    run_record = await get_run(run_id)
    if run_record is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return {"run_id": run_id, "events": await list_run_events(run_id, after_seq=after_seq)}


@router.post("/runs/{run_id}/commands", response_model=RunCommandAck, include_in_schema=False)
async def post_run_command(run_id: str, body: RunCommandRequest):
    runtime_service = get_debate_runtime_service()
    await runtime_service.reconcile_run_liveness(run_id)
    run_record = await get_run(run_id)
    if run_record is None:
        raise HTTPException(status_code=404, detail="Run not found")
    message = "Command recorded."
    command_payload = {"content": body.content} if body.content is not None else {}
    if body.command_type.value == "stop":
        if run_record.status in _TERMINAL_NON_RESUMABLE_RUN_STATUSES | {RunStatus.FAILED.value, RunStatus.CANCELLED.value}:
            message = "Run is already stopped."
        elif run_record.status == RunStatus.STALLED.value:
            await update_run_state(run_id, status=RunStatus.CANCELLED.value)
            message = "Stalled run was marked as cancelled."
        elif run_record.status in _STOPPABLE_RUN_STATUSES:
            stopped = await runtime_service.stop_run(run_id)
            if stopped:
                await update_run_state(run_id, status="stopping")
                message = "Stop requested."
            else:
                await runtime_service.reconcile_run_liveness(run_id)
                run_record = await get_run(run_id)
                if run_record is None:
                    raise HTTPException(status_code=404, detail="Run not found")
                message = f"Run stop was reconciled to {run_record.status}."
        else:
            raise HTTPException(status_code=409, detail="Run is not active and cannot be stopped.")
    elif body.command_type.value == "resume":
        if run_record.status in _TERMINAL_NON_RESUMABLE_RUN_STATUSES:
            raise HTTPException(status_code=409, detail="Run is already completed and cannot be resumed.")
        await update_run_state(run_id, status="initializing")
        result = await runtime_service.start_run(run_id)
        if not result.started and result.message != "This run is already running.":
            await update_run_state(run_id, status="failed")
            raise HTTPException(status_code=409, detail=result.message or "Run could not be resumed.")
        if not result.started:
            await update_run_state(run_id, status="running")
        message = result.message or "Resume requested."
    elif body.command_type.value == "intervene":
        if not body.content or not body.content.strip():
            raise HTTPException(status_code=422, detail="Intervention content is required.")
        await runtime_service.queue_intervention(run_id, body.content)
        message = "Intervention queued."
    await record_command(
        run_id=run_id,
        session_id=run_record.session_id,
        command_type=body.command_type,
        payload=command_payload,
    )
    return RunCommandAck(
        accepted=True,
        run_id=run_id,
        command_type=body.command_type,
        message=message,
    )
