from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import Request

from app.api import session_control
from app.middleware import demo_guard


def _build_request(path: str, method: str = "GET") -> Request:
    scope = {
        "type": "http",
        "method": method,
        "path": path,
        "headers": [],
        "query_string": b"",
        "client": ("127.0.0.1", 12345),
        "server": ("testserver", 80),
        "scheme": "http",
    }
    return Request(scope)


def test_demo_http_capability_table_covers_expected_guest_paths():
    assert demo_guard.get_demo_http_capability("/api/sessions", "GET") == "session.list"
    assert demo_guard.get_demo_http_capability("/api/sessions", "POST") == "session.create"
    assert demo_guard.get_demo_http_capability("/api/sessions/abcdef123456/start", "POST") == "session.runtime.start"
    assert demo_guard.get_demo_http_capability("/api/sessions/abcdef123456/live-events", "GET") == "session.runtime.live_events"
    assert demo_guard.get_demo_http_capability("/api/admin/status", "GET") == "admin.auth"


def test_demo_guest_request_allowance_defaults_and_admin_only_route():
    assert demo_guard.is_demo_guest_request_allowed("/api/sessions/abcdef123456/status", "GET") is True
    assert demo_guard.is_demo_guest_request_allowed("/api/sessions/abcdef123456/start", "POST") is True
    assert demo_guard.is_demo_guest_request_allowed("/api/sessions/abcdef123456/start", "OPTIONS") is True
    assert demo_guard.is_demo_guest_request_allowed("/api/admin/set-password", "POST") is False
    assert demo_guard.is_demo_guest_request_allowed("/api/sessions/abcdef123456", "DELETE") is False
    assert demo_guard.is_demo_guest_request_allowed("/api/unknown-readonly", "GET") is True


def test_extract_admin_token_from_request_checks_header_cookie_then_query():
    header_request = _build_request("/api/mode")
    header_request.scope["headers"] = [(b"authorization", b"Bearer header-token")]
    assert demo_guard.extract_admin_token_from_request(header_request) == "header-token"

    cookie_request = _build_request("/api/mode")
    cookie_request.scope["headers"] = [(b"cookie", b"elenchus_admin_token=cookie-token")]
    assert demo_guard.extract_admin_token_from_request(cookie_request) == "cookie-token"

    query_request = _build_request("/api/mode?admin_token=query-token")
    query_request.scope["query_string"] = b"admin_token=query-token"
    assert demo_guard.extract_admin_token_from_request(query_request) == "query-token"


def test_session_control_demo_dependency_allows_guest_capability(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(session_control, "get_settings", lambda: SimpleNamespace(demo=SimpleNamespace(enabled=True)))
    request = _build_request("/api/sessions/abcdef123456/live-events", "GET")

    assert session_control.require_demo_http_capability(request) is True


def test_session_control_demo_dependency_blocks_admin_only_capability(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(session_control, "get_settings", lambda: SimpleNamespace(demo=SimpleNamespace(enabled=True)))
    request = _build_request("/api/admin/set-password", "POST")

    with pytest.raises(session_control.HTTPException) as exc_info:
        session_control.require_demo_http_capability(request)

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == demo_guard.DEMO_MODE_ADMIN_REQUIRED_MESSAGE


def test_session_control_demo_dependency_allows_admin_token_for_admin_only_capability(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(session_control, "get_settings", lambda: SimpleNamespace(demo=SimpleNamespace(enabled=True)))
    monkeypatch.setattr(session_control, "is_valid_admin_token", lambda token: token == "admin-token")

    request = _build_request("/api/admin/set-password", "POST")
    request.scope["headers"] = [(b"authorization", b"Bearer admin-token")]

    assert session_control.require_demo_http_capability(request) is True
