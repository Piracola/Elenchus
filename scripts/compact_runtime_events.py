from __future__ import annotations

import shutil
import sqlite3
from pathlib import Path


def _default_db_path() -> Path:
    return Path(__file__).resolve().parents[1] / "runtime" / "elenchus.db"


def _backup_database(database_path: Path) -> Path:
    backup_path = database_path.with_name(f"{database_path.name}.pre-compact.bak")
    if not backup_path.exists():
        shutil.copy2(database_path, backup_path)
    return backup_path


def compact_runtime_events(database_path: Path) -> dict[str, int | str]:
    if not database_path.exists():
        raise FileNotFoundError(f"SQLite database not found: {database_path}")

    backup_path = _backup_database(database_path)
    with sqlite3.connect(database_path) as conn:
        before = conn.execute("SELECT COUNT(*) FROM run_events").fetchone()[0]
        deleted = conn.execute(
            """
            DELETE FROM run_events
            WHERE type IN ('speech_start', 'speech_token', 'projection_snapshot')
               OR (
                    type = 'status'
                    AND (
                        source LIKE '%.heartbeat'
                        OR json_extract(payload, '$.heartbeat') = 1
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
    args = parser.parse_args()

    result = compact_runtime_events(args.database)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
