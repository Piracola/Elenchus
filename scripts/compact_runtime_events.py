from __future__ import annotations

import shutil
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path


def _default_db_path() -> Path:
    return Path(__file__).resolve().parents[1] / "runtime" / "elenchus.db"


def _backup_database(database_path: Path) -> Path:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    backup_path = database_path.with_name(f"{database_path.name}.pre-compact-{timestamp}.bak")
    shutil.copy2(database_path, backup_path)
    return backup_path


def compact_runtime_events(database_path: Path, *, service_stopped: bool = False) -> dict[str, int | str]:
    if not database_path.exists():
        raise FileNotFoundError(f"SQLite database not found: {database_path}")
    if not service_stopped:
        raise RuntimeError("Refusing to compact a live database. Stop Elenchus and pass --service-stopped.")

    backup_path = _backup_database(database_path)
    with closing(sqlite3.connect(database_path, timeout=0)) as conn:
        conn.execute("PRAGMA locking_mode=EXCLUSIVE")
        conn.execute("BEGIN EXCLUSIVE")
        before = conn.execute("SELECT COUNT(*) FROM run_events").fetchone()[0]
        deleted = conn.execute(
            """
            DELETE FROM run_events
            WHERE type IN ('speech_start', 'speech_token', 'projection_snapshot', 'progress')
               OR (
                    type = 'status'
                    AND (
                        source LIKE '%.heartbeat'
                        OR json_extract(payload, '$.heartbeat') = 1
                        OR json_extract(payload, '$.elapsed_seconds') IS NOT NULL
                        OR json_extract(payload, '$.waiting_seconds') IS NOT NULL
                        OR json_extract(payload, '$.progress') IS NOT NULL
                    )
               )
            """
        ).rowcount
        conn.execute(
            """
            UPDATE runs
            SET latest_seq = COALESCE(
                (SELECT MAX(seq) FROM run_events WHERE run_events.run_id = runs.id),
                0
            )
            """
        )
        conn.execute(
            """
            UPDATE run_projections
            SET latest_seq = COALESCE(
                (SELECT MAX(seq) FROM run_events WHERE run_events.run_id = run_projections.run_id),
                0
            )
            """
        )
        after = conn.execute("SELECT COUNT(*) FROM run_events").fetchone()[0]
        conn.commit()
        conn.execute("VACUUM")

    return {
        "database": str(database_path),
        "backup": str(backup_path),
        "events_before": int(before),
        "events_deleted": int(deleted),
        "events_after": int(after),
    }


def main() -> None:
    import argparse
    import json

    parser = argparse.ArgumentParser(description="Remove transient runtime events from the Elenchus SQLite ledger.")
    parser.add_argument(
        "--database",
        type=Path,
        default=_default_db_path(),
        help="Path to elenchus.db. Defaults to runtime/elenchus.db.",
    )
    parser.add_argument(
        "--service-stopped",
        action="store_true",
        help="Required acknowledgement that all Elenchus backend processes are stopped.",
    )
    args = parser.parse_args()

    result = compact_runtime_events(args.database, service_stopped=args.service_stopped)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
