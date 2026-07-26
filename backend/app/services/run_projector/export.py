from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from sqlalchemy import desc, select

from app.models.ledger import RunProjectionRecord, RunRecord, SessionRecord

from .state import session_status_from_run


async def build_export_payload(
    session_factory: Any,
    rebuild_projection: Callable[[str], Awaitable[RunProjectionRecord | None]],
    session_id: str,
    *,
    run_id: str | None = None,
) -> dict[str, Any] | None:
    async with session_factory() as db:
        session = await db.get(SessionRecord, session_id)
        if session is None:
            return None

        run: RunRecord | None
        if run_id:
            run = await db.get(RunRecord, run_id)
            if run is None or run.session_id != session_id:
                return None
        else:
            result = await db.execute(
                select(RunRecord)
                .where(RunRecord.session_id == session_id)
                .order_by(desc(RunRecord.created_at))
                .limit(1)
            )
            run = result.scalar_one_or_none()

    projection = await rebuild_projection(run.id) if run is not None else None
    projected_data = projection.projection if projection and isinstance(projection.projection, dict) else {}
    return {
        "id": session.id,
        "session_id": session.id,
        "run_id": run.id if run else None,
        "topic": projected_data.get("topic", session.topic),
        "debate_mode": session.debate_mode,
        "mode_config": session.mode_config or {},
        "participants": projected_data.get("participants", session.participants or []),
        "max_turns": projected_data.get("max_turns", session.max_turns),
        "current_turn": run.current_turn if run else 0,
        "status": session_status_from_run(run.status if run else None),
        "run_status": run.status if run else None,
        "created_at": session.created_at,
        "updated_at": run.updated_at if run else session.updated_at,
        "dialogue_history": projected_data.get("dialogue_history", []),
        "shared_knowledge": projected_data.get("shared_knowledge", []),
        "current_scores": projected_data.get("current_scores", {}),
        "cumulative_scores": projected_data.get("cumulative_scores", {}),
        "agent_configs": projected_data.get("agent_configs", session.agent_configs or {}),
        "reasoning_config": projected_data.get("reasoning_config", session.reasoning_config or {}),
        "speech_config": projected_data.get("speech_config", session.speech_config or {}),
        "mode_artifacts": projected_data.get("mode_artifacts", []),
        "current_mode_report": projected_data.get("current_mode_report"),
        "final_mode_report": projected_data.get("final_mode_report"),
        "token_usage": projected_data.get("token_usage", {}),
    }
