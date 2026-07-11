from __future__ import annotations

from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.api import session_runtime as session_runtime_api
from app.main import app
from app.models.schemas import RunStatus


class _FakeRuntimeService:
    def __init__(self, *, start_result: object | None = None) -> None:
        self.started: list[str] = []
        self.stopped: list[str] = []
        self.interventions: list[tuple[str, str]] = []
        self.reconciled: list[str] = []
        self._start_result = start_result

    async def start_run(self, run_id: str):
        self.started.append(run_id)
        if self._start_result is not None:
            return self._start_result
        return SimpleNamespace(started=True, message=None)

    async def stop_run(self, run_id: str) -> bool:
        self.stopped.append(run_id)
        return True

    async def reconcile_run_liveness(self, run_id: str):
        self.reconciled.append(run_id)
        return None

    async def queue_intervention(self, run_id: str, content: str) -> bool:
        self.interventions.append((run_id, content))
        return True


async def _fake_record_command(**_: object):
    return {
        "id": "cmd_test",
        "run_id": "run_test",
        "session_id": "session_test",
        "command_type": "stop",
        "payload": {},
        "status": "pending",
        "acknowledged_at": None,
        "created_at": "2026-01-01T00:00:00Z",
    }


def test_resume_run_command_starts_existing_run(monkeypatch):
    runtime_service = _FakeRuntimeService()
    monkeypatch.setattr(
        session_runtime_api,
        "get_debate_runtime_service",
        lambda: runtime_service,
    )
    client = TestClient(app)

    session_response = client.post(
        "/api/sessions",
        json={"topic": "Resume command API", "max_turns": 3},
    )
    assert session_response.status_code == 201
    session_id = session_response.json()["id"]

    run_response = client.post(f"/api/sessions/{session_id}/runs", json={})
    assert run_response.status_code == 200
    run_id = run_response.json()["id"]
    assert runtime_service.started == [run_id]

    runtime_service.started.clear()
    resume_response = client.post(
        f"/api/runs/{run_id}/commands",
        json={"command_type": "resume"},
    )

    assert resume_response.status_code == 200
    assert resume_response.json()["command_type"] == "resume"
    assert runtime_service.started == [run_id]


def test_recent_config_api_returns_last_created_session_setup():
    client = TestClient(app)

    session_response = client.post(
        "/api/sessions",
        json={
            "topic": "Recent config API",
            "max_turns": 4,
            "reasoning_config": {
                "consensus_enabled": True,
                "group_discussion_rounds": 2,
            },
            "speech_config": {
                "proposer_max_chars": 900,
                "opposer_max_chars": 800,
                "group_discussion_max_chars": 500,
            },
        },
    )
    assert session_response.status_code == 201

    recent_response = client.get("/api/sessions/recent-config")

    assert recent_response.status_code == 200
    payload = recent_response.json()
    assert payload["max_turns"] == 4
    assert payload["reasoning_config"]["group_discussion_rounds"] == 2
    assert payload["speech_config"]["opposer_max_chars"] == 800


def test_start_run_reports_runtime_start_failure(monkeypatch):
    runtime_service = _FakeRuntimeService(
        start_result=SimpleNamespace(started=False, message="Run start payload missing."),
    )
    monkeypatch.setattr(
        session_runtime_api,
        "get_debate_runtime_service",
        lambda: runtime_service,
    )
    client = TestClient(app)

    session_response = client.post(
        "/api/sessions",
        json={"topic": "Start failure API", "max_turns": 3},
    )
    assert session_response.status_code == 201
    session_id = session_response.json()["id"]

    run_response = client.post(f"/api/sessions/{session_id}/runs", json={})

    assert run_response.status_code == 409
    assert run_response.json()["detail"] == "Run start payload missing."


def test_completed_run_cannot_be_resumed(monkeypatch):
    runtime_service = _FakeRuntimeService()
    async def fake_get_run(run_id: str):
        return SimpleNamespace(
            id=run_id,
            session_id="session_completed",
            status="completed",
        )

    monkeypatch.setattr(
        session_runtime_api,
        "get_debate_runtime_service",
        lambda: runtime_service,
    )
    monkeypatch.setattr(session_runtime_api, "get_run", fake_get_run)
    client = TestClient(app)

    resume_response = client.post(
        "/api/runs/run_completed/commands",
        json={"command_type": "resume"},
    )

    assert resume_response.status_code == 409
    assert runtime_service.started == []


def test_completed_run_cannot_be_stopped(monkeypatch):
    runtime_service = _FakeRuntimeService()

    async def fake_get_run(run_id: str):
        return SimpleNamespace(
            id=run_id,
            session_id="session_completed",
            status="completed",
        )

    monkeypatch.setattr(
        session_runtime_api,
        "get_debate_runtime_service",
        lambda: runtime_service,
    )
    monkeypatch.setattr(session_runtime_api, "get_run", fake_get_run)
    monkeypatch.setattr(session_runtime_api, "record_command", _fake_record_command)
    client = TestClient(app)

    stop_response = client.post(
        "/api/runs/run_completed/commands",
        json={"command_type": "stop"},
    )

    assert stop_response.status_code == 200
    assert stop_response.json()["message"] == "Run is already stopped."
    assert runtime_service.stopped == []


def test_stalled_run_stop_becomes_cancelled(monkeypatch):
    runtime_service = _FakeRuntimeService()
    cancellations: list[tuple[str, str, str]] = []

    async def fake_get_run(run_id: str):
        return SimpleNamespace(
            id=run_id,
            session_id="session_stalled",
            status=RunStatus.STALLED.value,
        )

    async def fake_transition_run_to_cancelled(run_id: str, *, reason: str, source: str):
        cancellations.append((run_id, reason, source))
        return {
            "id": run_id,
            "session_id": "session_stalled",
            "status": RunStatus.CANCELLED.value,
            "current_turn": 1,
            "latest_seq": 0,
            "last_status_message": "",
            "last_error_message": None,
            "started_at": None,
            "completed_at": None,
            "interrupted_at": None,
            "last_progress_at": None,
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
        }

    monkeypatch.setattr(
        session_runtime_api,
        "get_debate_runtime_service",
        lambda: runtime_service,
    )
    monkeypatch.setattr(session_runtime_api, "get_run", fake_get_run)
    monkeypatch.setattr(session_runtime_api, "transition_run_to_cancelled", fake_transition_run_to_cancelled)
    monkeypatch.setattr(session_runtime_api, "record_command", _fake_record_command)
    client = TestClient(app)

    stop_response = client.post(
        "/api/runs/run_stalled/commands",
        json={"command_type": "stop"},
    )

    assert stop_response.status_code == 200
    assert cancellations == [("run_stalled", "已取消等待恢复的运行。", "api.runs.stop")]
    assert runtime_service.stopped == []
