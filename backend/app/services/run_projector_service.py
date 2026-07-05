from __future__ import annotations

from typing import Any

from sqlalchemy import select

from app.db.database import get_session_factory
from app.models.ledger import RunEventRecord, RunProjectionRecord, RunRecord, SessionRecord
from app.services.session_service_helpers import sanitize_state_snapshot

from .run_projector.events import apply_event_to_projection
from .run_projector.export import build_export_payload
from .run_projector.payloads import default_projection
from .run_projector.queries import document_projection_entries
from .run_projector.state import sync_projection_record, utcnow


class RunProjectorService:
    """Build and maintain read-optimized run projections from ledger facts."""

    def __init__(self, session_factory: Any | None = None) -> None:
        self._fixed_session_factory = session_factory

    @property
    def _session_factory(self) -> Any:
        return self._fixed_session_factory or get_session_factory()

    async def initialize_projection(self, run_id: str) -> RunProjectionRecord | None:
        return await self.rebuild_projection(run_id)

    async def apply_event(self, run_id: str, *, seq: int | None = None) -> RunProjectionRecord | None:
        async with self._session_factory() as db:
            run = await db.get(RunRecord, run_id)
            if run is None:
                return None
            session = await db.get(SessionRecord, run.session_id)
            if session is None:
                return None
            projection = await db.get(RunProjectionRecord, run_id)
            if projection is None:
                return await self.rebuild_projection(run_id)

            last_applied_seq = int(projection.latest_seq or 0)
            event_query = select(RunEventRecord).where(
                RunEventRecord.run_id == run_id,
                RunEventRecord.seq > last_applied_seq,
            )
            if seq is not None:
                event_query = event_query.where(RunEventRecord.seq <= seq)
            event_query = event_query.order_by(RunEventRecord.seq)
            result = await db.execute(event_query)
            events = list(result.scalars())
            if not events:
                return projection

            projected_data = dict(projection.projection or {})
            for event in events:
                apply_event_to_projection(projected_data, event)
                projection.latest_seq = max(int(projection.latest_seq or 0), int(event.seq or 0))

            sync_projection_record(projection, run, projected_data)
            await db.commit()
            return projection

    async def rebuild_projection(self, run_id: str) -> RunProjectionRecord | None:
        async with self._session_factory() as db:
            run = await db.get(RunRecord, run_id)
            if run is None:
                return None
            session = await db.get(SessionRecord, run.session_id)
            if session is None:
                return None

            projected_data = default_projection(session)
            context_entries, builtin_docs = await document_projection_entries(db, session.id)
            if context_entries:
                projected_data["shared_knowledge"] = context_entries
            if builtin_docs:
                projected_data["builtin_reference_docs"] = builtin_docs

            result = await db.execute(
                select(RunEventRecord)
                .where(RunEventRecord.run_id == run_id)
                .order_by(RunEventRecord.seq)
            )
            latest_seq = 0
            for event in result.scalars():
                apply_event_to_projection(projected_data, event)
                latest_seq = max(latest_seq, int(event.seq or 0))

            projection = await db.get(RunProjectionRecord, run_id)
            if projection is None:
                projection = RunProjectionRecord(
                    run_id=run.id,
                    session_id=run.session_id,
                    version=0,
                    status=run.status,
                    current_turn=run.current_turn,
                    latest_seq=latest_seq,
                    node="",
                    status_message="",
                    projection=projected_data,
                    updated_at=utcnow(),
                )
                db.add(projection)
            else:
                projection.latest_seq = latest_seq
                projection.projection = projected_data
            sync_projection_record(projection, run, projected_data)
            await db.commit()
            return projection

    async def apply_snapshot(
        self,
        run_id: str,
        state_snapshot: dict[str, Any],
    ) -> RunProjectionRecord | None:
        async with self._session_factory() as db:
            run = await db.get(RunRecord, run_id)
            if run is None:
                return None
            session = await db.get(SessionRecord, run.session_id)
            if session is None:
                return None

            projection = await db.get(RunProjectionRecord, run_id)
            if projection is None:
                projected_data = default_projection(session)
                context_entries, builtin_docs = await document_projection_entries(db, session.id)
                if context_entries:
                    projected_data["shared_knowledge"] = context_entries
                if builtin_docs:
                    projected_data["builtin_reference_docs"] = builtin_docs
                projection = RunProjectionRecord(
                    run_id=run.id,
                    session_id=run.session_id,
                    version=0,
                    status=run.status,
                    current_turn=run.current_turn,
                    latest_seq=run.latest_seq,
                    node="",
                    status_message="",
                    projection=projected_data,
                    updated_at=utcnow(),
                )
                db.add(projection)
            else:
                projected_data = dict(projection.projection or {})

            projected_data.update(sanitize_state_snapshot(state_snapshot))
            projection.latest_seq = max(int(projection.latest_seq or 0), int(run.latest_seq or 0))
            sync_projection_record(projection, run, projected_data)
            await db.commit()
            return projection

    async def export_payload(self, session_id: str, *, run_id: str | None = None) -> dict[str, Any] | None:
        return await build_export_payload(
            self._session_factory,
            self.rebuild_projection,
            session_id,
            run_id=run_id,
        )
