from __future__ import annotations

import json
import sqlite3
import importlib.util
from pathlib import Path

import pytest

from app.runtime.event_persistence import (
    compact_runtime_event_payload,
    should_persist_runtime_event,
)
_SCRIPT_PATH = Path(__file__).resolve().parents[2] / "scripts" / "compact_runtime_events.py"
_SPEC = importlib.util.spec_from_file_location("compact_runtime_events", _SCRIPT_PATH)
assert _SPEC and _SPEC.loader
_MODULE = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(_MODULE)
compact_runtime_events = _MODULE.compact_runtime_events


def test_transient_progress_and_empty_histories_are_not_stored() -> None:
    assert not should_persist_runtime_event(
        "status",
        {"content": "still waiting", "elapsed_seconds": 12},
        source="runtime.node.judge",
    )
    assert not should_persist_runtime_event("progress", {"current": 3, "total": 10})
    assert compact_runtime_event_payload(
        {"content": "正式状态", "dialogue_history": [], "judge_history": []}
    ) == {"content": "正式状态"}


def test_compaction_requires_stopped_service_and_creates_fresh_backup(tmp_path) -> None:
    database = tmp_path / "elenchus.db"
    with sqlite3.connect(database) as conn:
        conn.executescript(
            """
            CREATE TABLE run_events (run_id TEXT, seq INTEGER, type TEXT, source TEXT, payload TEXT);
            CREATE TABLE runs (id TEXT PRIMARY KEY, latest_seq INTEGER);
            CREATE TABLE run_projections (run_id TEXT PRIMARY KEY, latest_seq INTEGER);
            INSERT INTO runs VALUES ('run-1', 3);
            INSERT INTO run_projections VALUES ('run-1', 3);
            """
        )
        conn.executemany(
            "INSERT INTO run_events VALUES (?, ?, ?, ?, ?)",
            [
                ("run-1", 1, "status", "runtime.node.judge.heartbeat", json.dumps({"heartbeat": True})),
                ("run-1", 2, "speech_token", "runtime.node.speaker", json.dumps({"token": "x"})),
                ("run-1", 3, "speech_end", "runtime.node.speaker", json.dumps({"content": "正式发言"})),
                ("run-1", 4, "progress", "runtime.node.speaker", json.dumps({"current": 1})),
                ("run-1", 5, "status", "runtime.node.judge", json.dumps({"elapsed_seconds": 5})),
            ],
        )

    with pytest.raises(RuntimeError, match="service-stopped"):
        compact_runtime_events(database)

    first = compact_runtime_events(database, service_stopped=True)
    second = compact_runtime_events(database, service_stopped=True)
    assert first["events_deleted"] == 4
    assert second["events_deleted"] == 0
    assert first["backup"] != second["backup"]
    assert Path(str(first["backup"])).exists()
    assert Path(str(second["backup"])).exists()

    with sqlite3.connect(database) as conn:
        assert conn.execute("SELECT type FROM run_events").fetchall() == [("speech_end",)]
        assert conn.execute("SELECT latest_seq FROM runs WHERE id = 'run-1'").fetchone() == (3,)
