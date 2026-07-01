from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_session_factory
from app.db.db_utils import _gen_id
from app.models.ledger import (
    RunCheckpointRecord,
    RunCommandRecord,
    RunEventRecord,
    RunProjectionRecord,
    RunRecord,
    SessionDocumentRecord,
    SessionRecord,
)
from app.models.schemas import RunCommandType, RunStatus, SessionStatus
from app.services.session_service_helpers import (
    default_reasoning_config,
    default_speech_config,
    merge_dialogue_for_display,
    normalize_mode_config,
    sanitize_state_snapshot,
)
from app.services.run_projector.documents import (
    BUILTIN_SOPHISTRY_DOCUMENT_ID,
    builtin_reference_doc,
    builtin_reference_entries,
    document_projection_entry,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _serialize_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _session_status_from_run(run_status: str | None) -> str:
    mapping = {
        RunStatus.PENDING.value: SessionStatus.PENDING.value,
        RunStatus.INITIALIZING.value: SessionStatus.IN_PROGRESS.value,
        RunStatus.RUNNING.value: SessionStatus.IN_PROGRESS.value,
        RunStatus.RETRYING.value: SessionStatus.IN_PROGRESS.value,
        RunStatus.RECOVERING.value: SessionStatus.IN_PROGRESS.value,
        RunStatus.STOPPING.value: SessionStatus.IN_PROGRESS.value,
        RunStatus.STALLED.value: SessionStatus.ERROR.value,
        RunStatus.COMPLETED.value: SessionStatus.COMPLETED.value,
        RunStatus.FAILED.value: SessionStatus.ERROR.value,
        RunStatus.CANCELLED.value: SessionStatus.PENDING.value,
    }
    return mapping.get(str(run_status or ""), SessionStatus.PENDING.value)


def _run_summary(run: RunRecord) -> dict[str, Any]:
    return {
        "id": run.id,
        "session_id": run.session_id,
        "status": run.status,
        "current_turn": run.current_turn,
        "latest_seq": run.latest_seq,
        "last_status_message": run.last_status_message or "",
        "last_error_message": run.last_error_message,
        "started_at": run.started_at,
        "completed_at": run.completed_at,
        "interrupted_at": run.interrupted_at,
        "last_progress_at": run.last_progress_at,
        "created_at": run.created_at,
        "updated_at": run.updated_at,
    }


@dataclass(slots=True)
class SessionAggregate:
    session: SessionRecord
    run: RunRecord | None
    projection: RunProjectionRecord | None
    documents: list[SessionDocumentRecord]


class RunLedgerService:
    """High-level access layer for the SQLite run ledger."""

    def __init__(self, session_factory: Any | None = None) -> None:
        self._fixed_session_factory = session_factory

    @property
    def _session_factory(self) -> Any:
        return self._fixed_session_factory or get_session_factory()

    async def create_session(self, payload: dict[str, Any]) -> SessionRecord:
        now = _utcnow()
        session = SessionRecord(
            id=str(payload["id"]),
            topic=str(payload["topic"]),
            debate_mode=str(payload.get("debate_mode", "standard")),
            participants=list(payload.get("participants", [])),
            max_turns=int(payload.get("max_turns", 5) or 5),
            mode_config=dict(payload.get("mode_config", {}) or {}),
            agent_configs=dict(payload.get("agent_configs", {}) or {}),
            reasoning_config=dict(payload.get("reasoning_config", {}) or {}),
            speech_config=dict(payload.get("speech_config", {}) or {}),
            archived=bool(payload.get("archived", False)),
            created_at=_serialize_datetime(payload.get("created_at")) or now,
            updated_at=_serialize_datetime(payload.get("updated_at")) or now,
        )
        async with self._session_factory() as db:
            db.add(session)
            await db.commit()
            await db.refresh(session)
            return session

    async def list_sessions(self, *, offset: int = 0, limit: int = 50) -> list[dict[str, Any]]:
        async with self._session_factory() as db:
            result = await db.execute(
                select(SessionRecord)
                .where(SessionRecord.archived.is_(False))
                .order_by(desc(SessionRecord.created_at))
                .offset(offset)
                .limit(limit)
            )
            sessions = list(result.scalars())
            aggregates = await self._load_latest_aggregates(db, [session.id for session in sessions])
            items: list[dict[str, Any]] = []
            for session in sessions:
                aggregate = aggregates.get(session.id)
                run = aggregate.run if aggregate else None
                items.append(
                    {
                        "id": session.id,
                        "latest_run_id": run.id if run else None,
                        "topic": session.topic,
                        "debate_mode": session.debate_mode,
                        "status": _session_status_from_run(run.status if run else None),
                        "current_turn": run.current_turn if run else 0,
                        "max_turns": session.max_turns,
                        "created_at": session.created_at,
                    }
                )
            return items

    async def count_sessions(self) -> int:
        async with self._session_factory() as db:
            result = await db.execute(
                select(func.count()).select_from(SessionRecord).where(SessionRecord.archived.is_(False))
            )
            return int(result.scalar_one() or 0)

    async def get_session(self, session_id: str) -> dict[str, Any] | None:
        async with self._session_factory() as db:
            aggregate = await self._load_aggregate(db, session_id)
            if aggregate is None:
                return None
            return self._session_base_payload(aggregate)

    async def get_session_for_run(self, run_id: str) -> dict[str, Any] | None:
        async with self._session_factory() as db:
            run = await db.get(RunRecord, run_id)
            if run is None:
                return None
            session = await db.get(SessionRecord, run.session_id)
            if session is None:
                return None
            projection = await db.get(RunProjectionRecord, run_id)
            if projection is None:
                return None
            documents = await self._load_session_documents(db, session.id)
            return self._session_base_payload(
                SessionAggregate(
                    session=session,
                    run=run,
                    projection=projection,
                    documents=documents,
                )
            )

    async def get_session_record(self, session_id: str) -> SessionRecord | None:
        async with self._session_factory() as db:
            result = await db.execute(select(SessionRecord).where(SessionRecord.id == session_id))
            return result.scalar_one_or_none()

    async def update_session_agent_configs(
        self,
        session_id: str,
        agent_configs: dict[str, dict[str, Any]] | None,
    ) -> dict[str, Any] | None:
        async with self._session_factory() as db:
            aggregate = await self._load_aggregate(db, session_id)
            if aggregate is None:
                return None
            aggregate.session.agent_configs = dict(agent_configs or {})
            aggregate.session.updated_at = _utcnow()
            await db.commit()
            return self._session_base_payload(aggregate)

    async def update_run_metadata(
        self,
        run_id: str,
        *,
        current_turn: int | None = None,
        status: str | None = None,
    ) -> dict[str, Any] | None:
        async with self._session_factory() as db:
            run = await db.get(RunRecord, run_id)
            if run is None:
                return None

            now = _utcnow()
            if current_turn is not None:
                run.current_turn = current_turn
            if status is not None:
                mapped_status = self._map_legacy_status(status)
                run.status = mapped_status
                if mapped_status == RunStatus.RUNNING.value and run.started_at is None:
                    run.started_at = now
                elif mapped_status == RunStatus.COMPLETED.value:
                    run.completed_at = now
                elif mapped_status in {RunStatus.FAILED.value, RunStatus.CANCELLED.value, RunStatus.STALLED.value}:
                    run.interrupted_at = now
            run.updated_at = now
            await db.commit()
            return _run_summary(run)

    async def delete_session(self, session_id: str) -> bool:
        async with self._session_factory() as db:
            aggregate = await self._load_aggregate(db, session_id)
            if aggregate is None:
                return False
            await db.delete(aggregate.session)
            await db.commit()
            return True

    async def create_run(
        self,
        session_id: str,
        *,
        topic: str,
        participants: list[str],
        max_turns: int,
        agent_configs: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        now = _utcnow()
        async with self._session_factory() as db:
            result = await db.execute(select(SessionRecord).where(SessionRecord.id == session_id))
            session = result.scalar_one_or_none()
            if session is None:
                raise ValueError(f"Session {session_id} was not found.")
            run = RunRecord(
                id=_gen_id(),
                session_id=session_id,
                status=RunStatus.PENDING.value,
                current_turn=0,
                latest_seq=0,
                last_status_message="",
                last_error_message=None,
                started_at=None,
                completed_at=None,
                interrupted_at=None,
                last_progress_at=None,
                created_at=now,
                updated_at=now,
            )
            db.add(run)
            await db.flush()
            event = RunEventRecord(
                id=f"evt_{_gen_id()}",
                run_id=run.id,
                session_id=session_id,
                seq=0,
                schema_version="v2",
                source="run.service",
                type="run_created",
                phase="initializing",
                payload={
                    "topic": topic,
                    "participants": list(participants),
                    "max_turns": max_turns,
                    "agent_configs": agent_configs or session.agent_configs or {},
                    "debate_mode": session.debate_mode,
                    "mode_config": session.mode_config or {},
                    "reasoning_config": session.reasoning_config or {},
                    "speech_config": session.speech_config or {},
                },
                created_at=now,
            )
            db.add(event)
            await db.commit()
            await db.refresh(run)
            return {
                "run": _run_summary(run),
                "session_id": session_id,
            }

    async def get_latest_run(self, session_id: str) -> RunRecord | None:
        async with self._session_factory() as db:
            result = await db.execute(
                select(RunRecord)
                .where(RunRecord.session_id == session_id)
                .order_by(desc(RunRecord.created_at))
                .limit(1)
            )
            return result.scalar_one_or_none()

    async def get_run(self, run_id: str) -> RunRecord | None:
        async with self._session_factory() as db:
            result = await db.execute(select(RunRecord).where(RunRecord.id == run_id))
            return result.scalar_one_or_none()

    async def list_nonterminal_run_ids(self) -> list[str]:
        async with self._session_factory() as db:
            result = await db.execute(
                select(RunRecord.id).where(
                    RunRecord.status.in_(
                        [
                            RunStatus.PENDING.value,
                            RunStatus.INITIALIZING.value,
                            RunStatus.RUNNING.value,
                            RunStatus.RETRYING.value,
                            RunStatus.RECOVERING.value,
                            RunStatus.STOPPING.value,
                        ]
                    )
                )
            )
            return [str(item) for item in result.scalars()]

    async def get_run_start_payload(self, run_id: str) -> dict[str, Any] | None:
        async with self._session_factory() as db:
            run = await db.get(RunRecord, run_id)
            if run is None:
                return None
            session = await db.get(SessionRecord, run.session_id)
            if session is None:
                return None
            result = await db.execute(
                select(RunEventRecord)
                .where(RunEventRecord.run_id == run_id)
                .where(RunEventRecord.seq == 0)
                .where(RunEventRecord.type == "run_created")
                .limit(1)
            )
            event = result.scalar_one_or_none()
            if event is None or not isinstance(event.payload, dict):
                return None
            payload = event.payload if event is not None and isinstance(event.payload, dict) else {}
            return {
                "run_id": run.id,
                "session_id": run.session_id,
                "topic": payload.get("topic", session.topic),
                "participants": payload.get("participants", session.participants or ["proposer", "opposer"]),
                "max_turns": payload.get("max_turns", session.max_turns),
                "agent_configs": payload.get("agent_configs", session.agent_configs or {}),
                "debate_mode": payload.get("debate_mode", session.debate_mode),
                "mode_config": payload.get("mode_config", session.mode_config or {}),
                "reasoning_config": payload.get("reasoning_config", session.reasoning_config or {}),
                "speech_config": payload.get("speech_config", session.speech_config or {}),
            }

    async def get_run_projection(self, run_id: str) -> RunProjectionRecord | None:
        async with self._session_factory() as db:
            result = await db.execute(
                select(RunProjectionRecord).where(RunProjectionRecord.run_id == run_id)
            )
            return result.scalar_one_or_none()

    async def get_latest_run_event_seq(self, run_id: str) -> int:
        async with self._session_factory() as db:
            result = await db.execute(
                select(func.coalesce(func.max(RunEventRecord.seq), 0)).where(
                    RunEventRecord.run_id == run_id
                )
            )
            return int(result.scalar_one() or 0)

    async def list_run_events(
        self,
        run_id: str,
        *,
        after_seq: int = 0,
        up_to_seq: int | None = None,
    ) -> list[dict[str, Any]]:
        async with self._session_factory() as db:
            query = select(RunEventRecord).where(
                RunEventRecord.run_id == run_id,
                RunEventRecord.seq > after_seq,
            )
            if up_to_seq is not None:
                query = query.where(RunEventRecord.seq <= up_to_seq)
            result = await db.execute(query.order_by(RunEventRecord.seq))
            events = []
            for record in result.scalars():
                events.append(self._event_to_dict(record))
            return events

    async def append_run_event(
        self,
        *,
        run_id: str,
        session_id: str | None,
        event_type: str,
        payload: dict[str, Any] | None = None,
        source: str = "runtime",
        phase: str | None = None,
        schema_version: str = "v2",
        event_id: str | None = None,
        seq: int | None = None,
        timestamp: datetime | str | None = None,
    ) -> dict[str, Any]:
        now = self._parse_datetime_like(timestamp) or _utcnow()
        async with self._session_factory() as db:
            run = await db.get(RunRecord, run_id)
            if run is None:
                raise ValueError(f"Run {run_id} was not found.")
            authoritative_session_id = run.session_id
            if session_id is not None and session_id != authoritative_session_id:
                raise ValueError(
                    f"Run {run_id} belongs to session {authoritative_session_id}, not {session_id}."
                )
            if seq is None:
                result = await db.execute(
                    select(func.coalesce(func.max(RunEventRecord.seq), 0)).where(
                        RunEventRecord.run_id == run_id
                    )
                )
                next_seq = int(result.scalar_one() or 0) + 1
            else:
                next_seq = int(seq)
            event = RunEventRecord(
                id=event_id or f"evt_{_gen_id()}",
                run_id=run_id,
                session_id=authoritative_session_id,
                seq=next_seq,
                schema_version=schema_version,
                source=source,
                type=event_type,
                phase=phase,
                payload=dict(payload or {}),
                created_at=now,
            )
            db.add(event)
            run.latest_seq = max(int(run.latest_seq or 0), next_seq)
            run.updated_at = now
            await db.commit()
            return self._event_to_dict(event)

    async def create_checkpoint(
        self,
        *,
        run_id: str,
        session_id: str,
        checkpoint_kind: str,
        node: str,
        seq: int,
        turn: int,
        state_snapshot: dict[str, Any],
    ) -> dict[str, Any]:
        now = _utcnow()
        async with self._session_factory() as db:
            run = await db.get(RunRecord, run_id)
            if run is None:
                raise ValueError(f"Run {run_id} was not found.")
            if session_id != run.session_id:
                raise ValueError(f"Run {run_id} belongs to session {run.session_id}, not {session_id}.")
            checkpoint = RunCheckpointRecord(
                id=f"cp_{_gen_id()}",
                run_id=run_id,
                session_id=run.session_id,
                checkpoint_kind=checkpoint_kind,
                node=node,
                seq=seq,
                turn=turn,
                state_snapshot=sanitize_state_snapshot(state_snapshot),
                created_at=now,
            )
            db.add(checkpoint)
            await db.commit()
            return {
                "id": checkpoint.id,
                "run_id": run_id,
                "session_id": run.session_id,
                "checkpoint_kind": checkpoint_kind,
                "node": node,
                "seq": seq,
                "turn": turn,
                "state_snapshot": checkpoint.state_snapshot,
                "created_at": now,
            }

    async def record_command(
        self,
        *,
        run_id: str,
        session_id: str,
        command_type: RunCommandType,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        now = _utcnow()
        async with self._session_factory() as db:
            run = await db.get(RunRecord, run_id)
            if run is None:
                raise ValueError(f"Run {run_id} was not found.")
            if session_id != run.session_id:
                raise ValueError(f"Run {run_id} belongs to session {run.session_id}, not {session_id}.")
            command = RunCommandRecord(
                id=f"cmd_{_gen_id()}",
                run_id=run_id,
                session_id=run.session_id,
                command_type=command_type.value,
                payload=dict(payload or {}),
                status="pending",
                acknowledged_at=None,
                created_at=now,
            )
            db.add(command)
            await db.commit()
            return {
                "id": command.id,
                "run_id": run_id,
                "session_id": run.session_id,
                "command_type": command_type.value,
                "payload": command.payload,
                "status": command.status,
                "acknowledged_at": command.acknowledged_at,
                "created_at": now,
            }

    async def attach_document_context(self, session_id: str, document: dict[str, Any]) -> None:
        async with self._session_factory() as db:
            result = await db.execute(
                select(SessionRecord).where(SessionRecord.id == session_id)
            )
            session = result.scalar_one_or_none()
            if session is None:
                return
            record = SessionDocumentRecord(
                id=str(document["id"]),
                session_id=session_id,
                filename=str(document["filename"]),
                mime_type=str(document.get("mime_type", "text/plain")),
                size_bytes=int(document.get("size_bytes", 0) or 0),
                status=str(document.get("status", "uploaded")),
                raw_text=document.get("raw_text"),
                normalized_text=document.get("normalized_text"),
                summary_short=document.get("summary_short"),
                error_message=document.get("error_message"),
                created_at=self._parse_datetime_like(document.get("created_at")) or _utcnow(),
                updated_at=self._parse_datetime_like(document.get("updated_at")) or _utcnow(),
            )
            db.add(record)
            await db.commit()

    async def upsert_session_document(self, session_id: str, document: dict[str, Any]) -> None:
        async with self._session_factory() as db:
            result = await db.execute(
                select(SessionDocumentRecord).where(
                    SessionDocumentRecord.session_id == session_id,
                    SessionDocumentRecord.id == str(document["id"]),
                )
            )
            record = result.scalar_one_or_none()
            now = _utcnow()
            if record is None:
                record = SessionDocumentRecord(
                    id=str(document["id"]),
                    session_id=session_id,
                    filename=str(document["filename"]),
                    mime_type=str(document.get("mime_type", "text/plain")),
                    size_bytes=int(document.get("size_bytes", 0) or 0),
                    status=str(document.get("status", "uploaded")),
                    raw_text=document.get("raw_text"),
                    normalized_text=document.get("normalized_text"),
                    summary_short=document.get("summary_short"),
                    error_message=document.get("error_message"),
                    created_at=self._parse_datetime_like(document.get("created_at")) or now,
                    updated_at=self._parse_datetime_like(document.get("updated_at")) or now,
                )
                db.add(record)
            else:
                record.filename = str(document["filename"])
                record.mime_type = str(document.get("mime_type", record.mime_type))
                record.size_bytes = int(document.get("size_bytes", record.size_bytes) or 0)
                record.status = str(document.get("status", record.status))
                record.raw_text = document.get("raw_text")
                record.normalized_text = document.get("normalized_text")
                record.summary_short = document.get("summary_short")
                record.error_message = document.get("error_message")
                record.updated_at = self._parse_datetime_like(document.get("updated_at")) or now
            await db.commit()

    async def session_documents(self, session_id: str) -> list[dict[str, Any]]:
        async with self._session_factory() as db:
            result = await db.execute(
                select(SessionDocumentRecord)
                .where(SessionDocumentRecord.session_id == session_id)
                .order_by(desc(SessionDocumentRecord.created_at))
            )
            return [self._document_to_dict(record) for record in result.scalars()]

    async def update_session_documents(self, session_id: str, document_id: str, payload: dict[str, Any]) -> None:
        async with self._session_factory() as db:
            result = await db.execute(
                select(SessionDocumentRecord).where(
                    SessionDocumentRecord.session_id == session_id,
                    SessionDocumentRecord.id == document_id,
                )
            )
            record = result.scalar_one_or_none()
            if record is None:
                return
            for key in ("status", "raw_text", "normalized_text", "summary_short", "error_message"):
                if key in payload:
                    setattr(record, key, payload[key])
            record.updated_at = _utcnow()
            await db.commit()

    async def clear_run_events(self, run_id: str) -> None:
        async with self._session_factory() as db:
            result = await db.execute(select(RunRecord).where(RunRecord.id == run_id))
            run = result.scalar_one_or_none()
            if run is None:
                return
            await db.execute(
                delete(RunEventRecord).where(
                    RunEventRecord.run_id == run_id,
                    RunEventRecord.seq > 0,
                )
            )
            await db.execute(delete(RunProjectionRecord).where(RunProjectionRecord.run_id == run_id))
            run.latest_seq = 0
            run.updated_at = _utcnow()
            await db.commit()

    def _session_base_payload(self, aggregate: SessionAggregate) -> dict[str, Any]:
        session = aggregate.session
        run = aggregate.run
        projected_data = (
            sanitize_state_snapshot(aggregate.projection.projection)
            if aggregate.projection is not None and isinstance(aggregate.projection.projection, dict)
            else {}
        )
        session_knowledge, builtin_docs = self._document_projection_entries(aggregate.documents)
        projected_knowledge = projected_data.get("shared_knowledge")
        if isinstance(projected_knowledge, list):
            shared_knowledge = self._merge_document_knowledge(projected_knowledge, session_knowledge)
        else:
            shared_knowledge = session_knowledge
        projected_builtin_docs = projected_data.get("builtin_reference_docs")
        if isinstance(projected_builtin_docs, list):
            builtin_reference_docs = self._merge_builtin_docs(projected_builtin_docs, builtin_docs)
        else:
            builtin_reference_docs = builtin_docs
        dialogue_history = projected_data.get("dialogue_history", [])
        judge_history = projected_data.get("judge_history", [])
        debate_mode = str(projected_data.get("debate_mode") or session.debate_mode or "standard")
        return {
            "id": session.id,
            "latest_run_id": run.id if run else None,
            "topic": projected_data.get("topic", session.topic),
            "debate_mode": debate_mode,
            "mode_config": normalize_mode_config(debate_mode, projected_data.get("mode_config", session.mode_config)),
            "participants": projected_data.get("participants", session.participants or ["proposer", "opposer"]),
            "max_turns": projected_data.get("max_turns", session.max_turns),
            "current_turn": run.current_turn if run else 0,
            "status": _session_status_from_run(run.status if run else None),
            "created_at": session.created_at,
            "updated_at": run.updated_at if run else session.updated_at,
            "dialogue_history": merge_dialogue_for_display(dialogue_history, judge_history),
            "shared_knowledge": shared_knowledge,
            "current_scores": projected_data.get("current_scores", {}),
            "cumulative_scores": projected_data.get("cumulative_scores", {}),
            "agent_configs": projected_data.get("agent_configs", session.agent_configs or {}),
            "reasoning_config": projected_data.get(
                "reasoning_config",
                session.reasoning_config or default_reasoning_config(),
            ),
            "speech_config": projected_data.get(
                "speech_config",
                session.speech_config or default_speech_config(),
            ),
            "mode_artifacts": projected_data.get("mode_artifacts", []),
            "current_mode_report": projected_data.get("current_mode_report"),
            "final_mode_report": projected_data.get("final_mode_report"),
            "builtin_reference_docs": builtin_reference_docs,
        }

    def _document_projection_entries(
        self,
        documents: list[SessionDocumentRecord],
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        knowledge: list[dict[str, Any]] = []
        builtin_docs: list[dict[str, Any]] = []
        for record in documents:
            if record.id == BUILTIN_SOPHISTRY_DOCUMENT_ID:
                knowledge.extend(builtin_reference_entries(record))
                builtin_docs.append(builtin_reference_doc(record))
                continue
            entry = document_projection_entry(record)
            if entry is not None:
                knowledge.append(entry)
        return knowledge, builtin_docs

    def _merge_document_knowledge(
        self,
        projected_items: list[Any],
        document_items: list[dict[str, Any]],
    ) -> list[Any]:
        merged = list(projected_items)
        existing_keys = {
            self._knowledge_key(item)
            for item in merged
            if isinstance(item, dict)
        }
        for item in document_items:
            key = self._knowledge_key(item)
            if key in existing_keys:
                continue
            merged.append(item)
            existing_keys.add(key)
        return merged

    def _merge_builtin_docs(
        self,
        projected_docs: list[Any],
        builtin_docs: list[dict[str, Any]],
    ) -> list[Any]:
        merged = list(projected_docs)
        existing_ids = {
            str(item.get("document_id", "") or "")
            for item in merged
            if isinstance(item, dict)
        }
        for item in builtin_docs:
            document_id = str(item.get("document_id", "") or "")
            if document_id in existing_ids:
                continue
            merged.append(item)
            existing_ids.add(document_id)
        return merged

    def _knowledge_key(self, item: dict[str, Any]) -> tuple[str, str, str]:
        return (
            str(item.get("type", "") or ""),
            str(item.get("document_id", "") or ""),
            str(item.get("title", "") or item.get("content", "") or "")[:120],
        )

    async def _load_latest_aggregates(
        self, db: AsyncSession, session_ids: list[str]
    ) -> dict[str, SessionAggregate]:
        aggregates: dict[str, SessionAggregate] = {}
        if not session_ids:
            return aggregates
        result = await db.execute(
            select(RunRecord)
            .where(RunRecord.session_id.in_(session_ids))
            .order_by(desc(RunRecord.created_at))
        )
        latest_runs: dict[str, RunRecord] = {}
        for run in result.scalars():
            latest_runs.setdefault(run.session_id, run)

        for session_id, run in latest_runs.items():
            projection = await db.get(RunProjectionRecord, run.id)
            session_result = await db.execute(
                select(SessionRecord).where(SessionRecord.id == session_id)
            )
            session = session_result.scalar_one_or_none()
            if session is not None:
                documents = await self._load_session_documents(db, session_id)
                aggregates[session_id] = SessionAggregate(
                    session=session,
                    run=run,
                    projection=projection,
                    documents=documents,
                )
        return aggregates

    async def _load_aggregate(self, db: AsyncSession, session_id: str) -> SessionAggregate | None:
        session_result = await db.execute(select(SessionRecord).where(SessionRecord.id == session_id))
        session = session_result.scalar_one_or_none()
        if session is None:
            return None
        run_result = await db.execute(
            select(RunRecord)
            .where(RunRecord.session_id == session_id)
            .order_by(desc(RunRecord.created_at))
            .limit(1)
        )
        run = run_result.scalar_one_or_none()
        projection = None
        if run is not None:
            projection_result = await db.execute(
                select(RunProjectionRecord).where(RunProjectionRecord.run_id == run.id)
            )
            projection = projection_result.scalar_one_or_none()
        documents = await self._load_session_documents(db, session_id)
        return SessionAggregate(session=session, run=run, projection=projection, documents=documents)

    async def _load_session_documents(
        self,
        db: AsyncSession,
        session_id: str,
    ) -> list[SessionDocumentRecord]:
        result = await db.execute(
            select(SessionDocumentRecord)
            .where(SessionDocumentRecord.session_id == session_id)
            .order_by(desc(SessionDocumentRecord.created_at))
        )
        return list(result.scalars())

    def _event_to_dict(self, record: RunEventRecord) -> dict[str, Any]:
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

    def _document_to_dict(self, record: SessionDocumentRecord) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "id": record.id,
            "session_id": record.session_id,
            "filename": record.filename,
            "mime_type": record.mime_type,
            "size_bytes": record.size_bytes,
            "status": record.status,
            "summary_short": record.summary_short,
            "error_message": record.error_message,
            "created_at": record.created_at,
            "updated_at": record.updated_at,
        }
        if record.raw_text is not None:
            payload["raw_text"] = record.raw_text
        if record.normalized_text is not None:
            payload["normalized_text"] = record.normalized_text
        return payload

    def _parse_datetime_like(self, value: Any) -> datetime | None:
        if isinstance(value, datetime):
            return _serialize_datetime(value)
        if isinstance(value, str) and value:
            normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
            try:
                parsed = datetime.fromisoformat(normalized)
            except ValueError:
                return None
            return _serialize_datetime(parsed)
        return None

    def _map_legacy_status(self, status: str) -> str:
        mapping = {
            SessionStatus.PENDING.value: RunStatus.PENDING.value,
            SessionStatus.IN_PROGRESS.value: RunStatus.RUNNING.value,
            SessionStatus.COMPLETED.value: RunStatus.COMPLETED.value,
            SessionStatus.ERROR.value: RunStatus.FAILED.value,
            "error": RunStatus.FAILED.value,
            "in_progress": RunStatus.RUNNING.value,
            "completed": RunStatus.COMPLETED.value,
            "cancelled": RunStatus.CANCELLED.value,
            "stalled": RunStatus.STALLED.value,
            "stopping": RunStatus.STOPPING.value,
            "recovering": RunStatus.RECOVERING.value,
            "retrying": RunStatus.RETRYING.value,
            "running": RunStatus.RUNNING.value,
            "initializing": RunStatus.INITIALIZING.value,
            "pending": RunStatus.PENDING.value,
        }
        return mapping.get(str(status or ""), RunStatus.RUNNING.value)
