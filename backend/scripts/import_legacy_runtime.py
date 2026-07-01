from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import sys
from collections.abc import Iterable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import select

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.database import init_db
from app.db.db_utils import _utcnow
from app.services.run_ledger_service import RunLedgerService
from app.services.run_projector_service import RunProjectorService
from app.services.session_service_helpers import (
    default_reasoning_config,
    default_speech_config,
    effective_configs_for_mode,
    normalize_mode_config,
    sanitize_state_snapshot,
)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Import legacy runtime/sessions file-based records into the SQLite ledger."
    )
    parser.add_argument(
        "--runtime-root",
        type=Path,
        default=Path("runtime"),
        help="Runtime root containing the legacy sessions directory. Defaults to ./runtime",
    )
    parser.add_argument(
        "--session-id",
        action="append",
        default=[],
        help="Import only the given legacy session id. Can be passed multiple times.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-import even if the target session already exists in SQLite.",
    )
    return parser.parse_args()


def _parse_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
    if not isinstance(value, str) or not value.strip():
        return _utcnow()
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return _utcnow()
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _iter_jsonl(path: Path) -> Iterable[dict[str, Any]]:
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        try:
            parsed = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            yield parsed


def _normalize_reasoning_config(debate_mode: str, snapshot: dict[str, Any]) -> dict[str, Any]:
    reasoning = snapshot.get("reasoning_config")
    if not isinstance(reasoning, dict):
        reasoning = default_reasoning_config()
    else:
        merged = default_reasoning_config()
        merged.update(reasoning)
        reasoning = merged
    return effective_configs_for_mode(debate_mode, reasoning)


def _normalize_speech_config(snapshot: dict[str, Any]) -> dict[str, Any]:
    speech = snapshot.get("speech_config")
    if not isinstance(speech, dict):
        return default_speech_config()
    merged = default_speech_config()
    merged.update(speech)
    return merged


def _normalize_status(value: Any) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {"error", "failed"}:
        return "failed"
    if normalized in {"completed", "done"}:
        return "completed"
    if normalized in {"cancelled", "canceled"}:
        return "cancelled"
    if normalized in {"stalled", "stopping", "recovering", "retrying", "initializing", "running", "pending"}:
        return normalized
    if normalized == "in_progress":
        return "running"
    return "pending"


def _build_run_projection(
    session_record: dict[str, Any],
    state_snapshot: dict[str, Any],
) -> dict[str, Any]:
    projection = sanitize_state_snapshot(state_snapshot)
    projection.setdefault("topic", session_record.get("topic", ""))
    projection.setdefault("participants", session_record.get("participants", []))
    projection.setdefault("max_turns", session_record.get("max_turns", 5))
    projection.setdefault("debate_mode", session_record.get("debate_mode", "standard"))
    projection.setdefault("mode_config", session_record.get("mode_config", {}))
    projection.setdefault("shared_knowledge", [])
    projection.setdefault("dialogue_history", [])
    projection.setdefault("judge_history", [])
    projection.setdefault("current_scores", {})
    projection.setdefault("cumulative_scores", {})
    projection.setdefault("mode_artifacts", [])
    projection.setdefault("current_mode_report", None)
    projection.setdefault("final_mode_report", None)
    projection.setdefault("builtin_reference_docs", [])
    projection.setdefault("last_executed_node", "")
    projection.setdefault("last_progress_at", "")
    projection.setdefault("last_status_message", "")
    projection.setdefault("resume_count", 0)
    projection.setdefault("interrupted_at", None)
    return projection


async def _document_id_for_import(
    ledger: RunLedgerService,
    session_id: str,
    document_id: str,
) -> str:
    async with ledger._session_factory() as db:  # noqa: SLF001
        from app.models.ledger import SessionDocumentRecord

        existing = await db.get(SessionDocumentRecord, document_id)
        if existing is None or existing.session_id == session_id:
            return document_id
    digest = hashlib.sha1(f"{session_id}:{document_id}".encode("utf-8")).hexdigest()[:25]
    return f"legacy_{digest}"


async def _import_session(
    ledger: RunLedgerService,
    projector: RunProjectorService,
    legacy_session_dir: Path,
    *,
    force: bool,
) -> tuple[str, str]:
    session_path = legacy_session_dir / "session.json"
    if not session_path.exists():
        return legacy_session_dir.name, "skipped: missing session.json"

    session_record = _read_json(session_path)
    session_id = str(session_record.get("id") or legacy_session_dir.name)
    existing_session = await ledger.get_session_record(session_id)

    debate_mode = str(session_record.get("debate_mode") or "standard")
    state_snapshot = session_record.get("state_snapshot")
    if not isinstance(state_snapshot, dict):
        state_snapshot = {}
    state_snapshot = sanitize_state_snapshot(state_snapshot)
    topic = str(session_record.get("topic") or state_snapshot.get("topic") or "")
    participants = list(session_record.get("participants") or state_snapshot.get("participants") or ["proposer", "opposer"])
    max_turns = int(session_record.get("max_turns") or state_snapshot.get("max_turns") or 5)
    mode_config = normalize_mode_config(
        debate_mode,
        state_snapshot.get("mode_config", session_record.get("mode_config", {})),
    )
    agent_configs = state_snapshot.get("agent_configs")
    if not isinstance(agent_configs, dict):
        agent_configs = {}
    reasoning_config = _normalize_reasoning_config(debate_mode, state_snapshot)
    speech_config = _normalize_speech_config(state_snapshot)

    created_at = _parse_datetime(session_record.get("created_at"))
    updated_at = _parse_datetime(session_record.get("updated_at"))

    session_payload = {
        "id": session_id,
        "topic": topic,
        "debate_mode": debate_mode,
        "participants": participants,
        "max_turns": max_turns,
        "mode_config": mode_config,
        "agent_configs": agent_configs,
        "reasoning_config": reasoning_config,
        "speech_config": speech_config,
        "created_at": created_at,
        "updated_at": updated_at,
    }

    changed_parts: list[str] = []
    if existing_session is None:
        await ledger.create_session(session_payload)
        changed_parts.append("session")
    elif force:
        async with ledger._session_factory() as db:  # noqa: SLF001
            from app.models.ledger import SessionRecord

            session = await db.get(SessionRecord, session_id)
            if session is not None:
                session.topic = topic
                session.debate_mode = debate_mode
                session.participants = participants
                session.max_turns = max_turns
                session.mode_config = mode_config
                session.agent_configs = agent_configs
                session.reasoning_config = reasoning_config
                session.speech_config = speech_config
                session.created_at = created_at
                session.updated_at = updated_at
                await db.commit()
                changed_parts.append("session")

    documents_dir = legacy_session_dir / "documents"
    if documents_dir.exists():
        for path in sorted(documents_dir.glob("*.json")):
            try:
                document = _read_json(path)
            except Exception:
                continue
            if not isinstance(document, dict):
                continue
            document_id = await _document_id_for_import(
                ledger,
                session_id,
                str(document.get("id") or path.stem),
            )
            before_documents = len(await ledger.session_documents(session_id))
            await ledger.upsert_session_document(
                session_id,
                {
                    "id": document_id,
                    "filename": str(document.get("filename") or path.name),
                    "mime_type": str(document.get("mime_type") or "text/plain"),
                    "size_bytes": int(document.get("size_bytes") or 0),
                    "status": str(document.get("status") or "uploaded"),
                    "raw_text": document.get("raw_text"),
                    "normalized_text": document.get("normalized_text"),
                    "summary_short": document.get("summary_short"),
                    "error_message": document.get("error_message"),
                    "created_at": document.get("created_at"),
                    "updated_at": document.get("updated_at"),
                },
            )
            after_documents = len(await ledger.session_documents(session_id))
            if after_documents > before_documents and "documents" not in changed_parts:
                changed_parts.append("documents")

    legacy_events = list(_iter_jsonl(legacy_session_dir / "events.jsonl")) if (legacy_session_dir / "events.jsonl").exists() else []
    max_event_seq = 0
    for event in legacy_events:
        seq = int(event.get("seq", 0) or 0)
        if seq > max_event_seq:
            max_event_seq = seq

    run_status = _normalize_status(session_record.get("status") or state_snapshot.get("status"))
    current_turn = int(session_record.get("current_turn") or state_snapshot.get("current_turn") or 0)
    last_status_message = str(state_snapshot.get("last_status_message", "") or "")
    last_error_message = state_snapshot.get("error")
    if last_error_message is not None:
        last_error_message = str(last_error_message)
    interrupted_at = _parse_datetime(state_snapshot.get("interrupted_at")) if state_snapshot.get("interrupted_at") else None
    completed_at = updated_at if run_status == "completed" else None
    started_at = created_at if run_status in {"running", "completed", "failed", "cancelled", "stalled"} else None
    last_progress_at = _parse_datetime(state_snapshot.get("last_progress_at")) if state_snapshot.get("last_progress_at") else None

    async with ledger._session_factory() as db:  # noqa: SLF001
        from app.models.ledger import RunEventRecord, RunProjectionRecord, RunRecord

        run = await db.get(RunRecord, session_id)
        if run is None:
            run = RunRecord(
                id=session_id,
                session_id=session_id,
                status=run_status,
                current_turn=current_turn,
                latest_seq=max_event_seq,
                last_status_message=last_status_message,
                last_error_message=last_error_message,
                started_at=started_at,
                completed_at=completed_at,
                interrupted_at=interrupted_at,
                last_progress_at=last_progress_at,
                created_at=created_at,
                updated_at=updated_at,
            )
            db.add(run)
            changed_parts.append("run")
        elif force:
            run.status = run_status
            run.current_turn = current_turn
            run.latest_seq = max(int(run.latest_seq or 0), max_event_seq)
            run.last_status_message = last_status_message
            run.last_error_message = last_error_message
            run.started_at = started_at
            run.completed_at = completed_at
            run.interrupted_at = interrupted_at
            run.last_progress_at = last_progress_at
            run.created_at = created_at
            run.updated_at = updated_at
            changed_parts.append("run")

        run_created_payload = {
            "topic": topic,
            "participants": participants,
            "max_turns": max_turns,
            "agent_configs": agent_configs,
            "debate_mode": debate_mode,
            "mode_config": mode_config,
            "reasoning_config": reasoning_config,
            "speech_config": speech_config,
        }
        existing_seq_result = await db.execute(
            select(RunEventRecord.seq).where(RunEventRecord.run_id == session_id)
        )
        existing_event_seqs = {int(seq) for seq in existing_seq_result.scalars()}
        imported_events = 0
        if 0 not in existing_event_seqs:
            db.add(
                RunEventRecord(
                    id=f"evt_{session_id}_run_created",
                    run_id=session_id,
                    session_id=session_id,
                    seq=0,
                    schema_version="v2",
                    source="legacy.import",
                    type="run_created",
                    phase="initializing",
                    payload=run_created_payload,
                    created_at=created_at,
                )
            )
            existing_event_seqs.add(0)
            imported_events += 1

        for event in legacy_events:
            seq = int(event.get("seq", 0) or 0)
            if seq in existing_event_seqs:
                continue
            db.add(
                RunEventRecord(
                    id=str(event.get("event_id") or f"evt_{session_id}_{seq}"),
                    run_id=session_id,
                    session_id=session_id,
                    seq=seq,
                    schema_version=str(event.get("schema_version") or "legacy"),
                    source=str(event.get("source") or "legacy.runtime"),
                    type=str(event.get("type") or "system"),
                    phase=str(event.get("phase")) if event.get("phase") is not None else None,
                    payload=dict(event.get("payload") or {}),
                    created_at=_parse_datetime(event.get("timestamp")),
                )
            )
            existing_event_seqs.add(seq)
            imported_events += 1

        projection_payload = _build_run_projection(session_record, state_snapshot)
        projection = await db.get(RunProjectionRecord, session_id)
        if projection is None:
            db.add(
                RunProjectionRecord(
                    run_id=session_id,
                    session_id=session_id,
                    version=1,
                    status=run_status,
                    current_turn=current_turn,
                    latest_seq=max_event_seq,
                    node=str(projection_payload.get("last_executed_node", "") or ""),
                    status_message=last_status_message,
                    projection=projection_payload,
                    updated_at=updated_at,
                )
            )
            changed_parts.append("projection")
        elif force:
            projection.version = int(projection.version or 0) + 1
            projection.status = run_status
            projection.current_turn = current_turn
            projection.latest_seq = max(int(projection.latest_seq or 0), max_event_seq)
            projection.node = str(projection_payload.get("last_executed_node", "") or "")
            projection.status_message = last_status_message
            projection.projection = projection_payload
            projection.updated_at = updated_at
            changed_parts.append("projection")

        if imported_events:
            run.latest_seq = max(int(run.latest_seq or 0), max(existing_event_seqs))
            run.updated_at = updated_at
            changed_parts.append(f"{imported_events} events")
        await db.commit()

    if not changed_parts:
        return session_id, "skipped: already imported"
    await projector.rebuild_projection(session_id)
    return session_id, "imported: " + ", ".join(changed_parts)


async def _main() -> int:
    args = _parse_args()
    runtime_root = args.runtime_root.resolve()
    sessions_root = runtime_root / "sessions"
    if not sessions_root.exists():
        print(f"未找到旧运行目录：{sessions_root}")
        return 1

    await init_db()
    ledger = RunLedgerService()
    projector = RunProjectorService()

    target_ids = set(args.session_id)
    session_dirs = sorted(path for path in sessions_root.iterdir() if path.is_dir())
    if target_ids:
        session_dirs = [path for path in session_dirs if path.name in target_ids]

    imported = 0
    skipped = 0
    for session_dir in session_dirs:
        try:
            session_id, result = await _import_session(
                ledger,
                projector,
                session_dir,
                force=args.force,
            )
        except Exception as exc:
            print(f"[FAIL] {session_dir.name}: {exc}")
            skipped += 1
            continue
        prefix = "[OK]" if result.startswith("imported") else "[SKIP]"
        print(f"{prefix} {session_id}: {result}")
        if prefix == "[OK]":
            imported += 1
        else:
            skipped += 1

    print(f"完成。导入 {imported} 条，会话跳过/失败 {skipped} 条。")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_main()))
