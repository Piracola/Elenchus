from __future__ import annotations

from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.main import app


def test_admin_login_rate_limit_returns_metadata(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.api.admin.consume_rate_limit",
        lambda _ip, _bucket: SimpleNamespace(
            allowed=False,
            retry_after=42,
            as_headers=lambda: {
                "Retry-After": "42",
                "X-RateLimit-Limit": "5",
                "X-RateLimit-Remaining": "0",
            },
            as_metadata=lambda: {
                "limit": 5,
                "remaining": 0,
                "retry_after": 42,
                "window_seconds": 60,
            },
        ),
    )

    with TestClient(app) as client:
        response = client.post(
            "/api/admin/login",
            json={"username": "admin", "password": "wrong"},
        )

    assert response.status_code == 429
    assert response.headers["retry-after"] == "42"
    assert response.headers["x-ratelimit-limit"] == "5"
    assert response.headers["x-ratelimit-remaining"] == "0"
    assert response.json() == {
        "detail": "Too many login attempts. Please try again later.",
        "rate_limit": {
            "limit": 5,
            "remaining": 0,
            "retry_after": 42,
            "window_seconds": 60,
        },
    }
