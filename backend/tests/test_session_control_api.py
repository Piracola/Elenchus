from __future__ import annotations

from types import SimpleNamespace

from fastapi.testclient import TestClient
from fastapi import Request

from app.api import session_control
from app.main import app
from app.dependencies import get_debate_runtime_service
from app.middleware.auth import require_auth


class _FakeRuntimeService:
    def __init__(self) -> None:
        self.started = False
        self.stopped = False

    async def start_session(self, session_id: str):
        self.started = True
        return SimpleNamespace(started=True, message=None, session={"id": session_id, "topic": "Demo topic"})

    async def stop_session(self, session_id: str):
        self.stopped = True
        return True

    def is_running(self, session_id: str) -> bool:
        return False

    async def queue_intervention(self, session_id: str, content: str) -> bool:
        return True


def test_start_and_stop_routes_use_session_control_contract(monkeypatch):
    runtime_service = _FakeRuntimeService()

    monkeypatch.setattr("app.api.session_control.get_settings", lambda: SimpleNamespace(demo=SimpleNamespace(enabled=False)))

    async def _get_session(session_id: str):
        return {
            "id": session_id,
            "topic": "Demo topic",
            "participants": [],
            "current_turn": 0,
            "max_turns": 3,
            "status": "pending",
        }

    monkeypatch.setattr(session_control.session_service, "get_session", _get_session)
    def _allow_auth(request: Request) -> bool:
        return True

    app.dependency_overrides[get_debate_runtime_service] = lambda: runtime_service
    app.dependency_overrides[require_auth] = _allow_auth

    try:
        client = TestClient(app)

        start_response = client.post("/api/sessions/abcdef123456/start")
        assert start_response.status_code == 200
        assert start_response.json()["success"] is True
        assert start_response.json()["session_id"] == "abcdef123456"
        assert start_response.json()["session"]["id"] == "abcdef123456"
        assert runtime_service.started is True

        stop_response = client.post("/api/sessions/abcdef123456/stop")
        assert stop_response.status_code == 200
        assert stop_response.json() == {
            "success": True,
            "session_id": "abcdef123456",
            "message": "Debate session stopped successfully",
        }
        assert runtime_service.stopped is True
    finally:
        app.dependency_overrides.clear()
