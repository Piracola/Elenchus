from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import Request

from app.api import session_control
from app.middleware import demo_guard


def _build_request(path: str, method: str = "POST", headers: list[tuple[bytes, bytes]] | None = None) -> Request:
    scope = {
        "type": "http",
        "method": method,
        "path": path,
        "headers": headers or [],
        "query_string": b"",
        "client": ("127.0.0.1", 12345),
        "server": ("testserver", 80),
        "scheme": "http",
    }
    return Request(scope)


def test_require_demo_http_capability_allows_admin_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        session_control,
        "get_settings",
        lambda: SimpleNamespace(demo=SimpleNamespace(enabled=True)),
    )
    monkeypatch.setattr(session_control, "is_valid_admin_token", lambda token: token == "admin-token")

    request = _build_request(
        "/api/admin/set-password",
        headers=[(b"authorization", b"Bearer admin-token")],
    )

    assert session_control.require_demo_http_capability(request) is True


def test_require_demo_http_capability_blocks_guest_for_admin_only_capability(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        session_control,
        "get_settings",
        lambda: SimpleNamespace(demo=SimpleNamespace(enabled=True)),
    )
    request = _build_request("/api/admin/set-password")

    with pytest.raises(session_control.HTTPException) as exc_info:
        session_control.require_demo_http_capability(request)

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == demo_guard.DEMO_MODE_ADMIN_REQUIRED_MESSAGE
