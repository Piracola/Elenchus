from __future__ import annotations

from types import SimpleNamespace

from app.db import database as db_module


class _FakeEngine:
    """Minimal stand-in exposing the sync_engine attribute used for PRAGMA hooks."""

    def __init__(self) -> None:
        self.sync_engine = SimpleNamespace(dialect=SimpleNamespace(name="sqlite"))


def test_database_engine_does_not_echo_sql_when_debug_is_enabled(monkeypatch):
    captured: dict[str, object] = {}

    def fake_create_async_engine(database_url: str, **kwargs):
        captured["database_url"] = database_url
        captured.update(kwargs)
        return _FakeEngine()

    monkeypatch.setattr(
        db_module,
        "get_settings",
        lambda: SimpleNamespace(
            env=SimpleNamespace(
                database_url="sqlite+aiosqlite:///test.db",
                debug=True,
            )
        ),
    )
    monkeypatch.setattr(db_module, "create_async_engine", fake_create_async_engine)
    monkeypatch.setattr(
        db_module,
        "event",
        SimpleNamespace(listens_for=lambda *args, **kwargs: (lambda fn: fn)),
    )
    monkeypatch.setattr(db_module, "_engine", None)

    db_module._get_engine()

    assert captured == {
        "database_url": "sqlite+aiosqlite:///test.db",
        "echo": False,
        "connect_args": {"timeout": 30},
    }


def test_database_engine_passes_no_sqlite_connect_args_for_other_backends(monkeypatch):
    captured: dict[str, object] = {}

    def fake_create_async_engine(database_url: str, **kwargs):
        captured["database_url"] = database_url
        captured.update(kwargs)
        return _FakeEngine()

    monkeypatch.setattr(
        db_module,
        "get_settings",
        lambda: SimpleNamespace(
            env=SimpleNamespace(
                database_url="postgresql+asyncpg://localhost/elenchus",
                debug=False,
            )
        ),
    )
    monkeypatch.setattr(db_module, "create_async_engine", fake_create_async_engine)
    monkeypatch.setattr(
        db_module,
        "event",
        SimpleNamespace(listens_for=lambda *args, **kwargs: (lambda fn: fn)),
    )
    monkeypatch.setattr(db_module, "_engine", None)

    db_module._get_engine()

    assert captured == {
        "database_url": "postgresql+asyncpg://localhost/elenchus",
        "echo": False,
        "connect_args": {},
    }
