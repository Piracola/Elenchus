from __future__ import annotations

import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from app.config import get_settings
from app.middleware import rate_limit
from app.runtime_config_store import normalize_runtime_config


def test_check_rate_limit_enforces_cap_across_threads() -> None:
    ip = "203.0.113.10"
    bucket = "ws_message"
    max_requests, _window = rate_limit._RULES[bucket]
    gate = threading.Event()
    ready = threading.Barrier(max_requests)
    results: list[bool] = []

    rate_limit.reset_ip(ip)

    def attempt() -> bool:
        ready.wait(timeout=1)
        gate.wait(timeout=1)
        return rate_limit.check_rate_limit(ip, bucket)

    try:
        with ThreadPoolExecutor(max_workers=max_requests) as executor:
            futures = [executor.submit(attempt) for _ in range(max_requests)]
            gate.set()
            results = [future.result(timeout=1) for future in futures]

        assert sum(1 for value in results if value) == max_requests
        assert rate_limit.check_rate_limit(ip, bucket) is False
        assert rate_limit.get_remaining(ip, bucket) == 0
    finally:
        rate_limit.reset_ip(ip)


def test_get_remaining_does_not_create_empty_state_for_unknown_ip(monkeypatch) -> None:
    ip = "203.0.113.11"
    monkeypatch.setenv("ELENCHUS_RATE_LIMIT_BACKEND", "memory")
    rate_limit.reset_rate_limit_store()
    try:
        rate_limit.reset_ip(ip)
        assert rate_limit.get_remaining(ip, "create_session") == 3
        assert ip not in rate_limit._buckets
    finally:
        monkeypatch.delenv("ELENCHUS_RATE_LIMIT_BACKEND", raising=False)
        rate_limit.reset_rate_limit_store()


def test_get_remaining_and_reset_ip_share_consistent_state() -> None:
    ip = "203.0.113.12"
    rate_limit.reset_ip(ip)

    assert rate_limit.get_remaining(ip, "create_session") == 3
    assert rate_limit.check_rate_limit(ip, "create_session") is True
    assert rate_limit.get_remaining(ip, "create_session") == 2

    rate_limit.reset_ip(ip)

    assert rate_limit.get_remaining(ip, "create_session") == 3


def test_consume_rate_limit_returns_retry_metadata_when_limited() -> None:
    ip = "203.0.113.14"
    bucket = "admin_login"

    rate_limit.reset_ip(ip)

    try:
        first = rate_limit.consume_rate_limit(ip, bucket)
        second = rate_limit.consume_rate_limit(ip, bucket)
        third = rate_limit.consume_rate_limit(ip, bucket)
        fourth = rate_limit.consume_rate_limit(ip, bucket)
        fifth = rate_limit.consume_rate_limit(ip, bucket)
        blocked = rate_limit.consume_rate_limit(ip, bucket)

        assert all(decision.allowed for decision in [first, second, third, fourth, fifth])
        assert fifth.remaining == 0
        assert blocked.allowed is False
        assert blocked.remaining == 0
        assert blocked.retry_after > 0
        assert blocked.as_headers()["Retry-After"] == str(blocked.retry_after)
    finally:
        rate_limit.reset_ip(ip)


def test_waiting_thread_uses_fresh_time_after_lock_release(monkeypatch) -> None:
    ip = "203.0.113.13"
    bucket = "ws_message"
    window = 0.02
    max_requests = 1

    original_rule = rate_limit._RULES[bucket]
    original_time = rate_limit.time.time
    original_cleanup = rate_limit._maybe_cleanup
    original_cleanup_interval = rate_limit._CLEANUP_INTERVAL_SECONDS
    original_last_cleanup = rate_limit._last_cleanup

    first_time = threading.Event()
    release_time = threading.Event()
    fake_now = {"value": 1000.0}
    first_phase = {"done": False}

    monkeypatch.setenv("ELENCHUS_RATE_LIMIT_BACKEND", "memory")
    rate_limit.reset_rate_limit_store()
    try:
        def fake_time() -> float:
            if not first_phase["done"]:
                first_phase["done"] = True
                first_time.set()
                release_time.wait(timeout=1)
            return fake_now["value"]

        def slow_cleanup() -> None:
            time_before = fake_now["value"]
            fake_now["value"] = time_before + window + 0.01

        rate_limit.reset_ip(ip)
        rate_limit._RULES[bucket] = (max_requests, window)
        rate_limit._CLEANUP_INTERVAL_SECONDS = 0
        rate_limit._last_cleanup = fake_now["value"] - 1
        rate_limit.time.time = fake_time
        rate_limit._maybe_cleanup = slow_cleanup

        assert rate_limit.check_rate_limit(ip, bucket) is True

        worker_result: dict[str, bool] = {}

        def blocked_attempt() -> None:
            worker_result["allowed"] = rate_limit.check_rate_limit(ip, bucket)

        worker = threading.Thread(target=blocked_attempt)
        worker.start()
        assert first_time.wait(timeout=1)
        release_time.set()
        worker.join(timeout=1)

        assert worker_result["allowed"] is True
        assert rate_limit.get_remaining(ip, bucket) == 0
    finally:
        release_time.set()
        rate_limit._RULES[bucket] = original_rule
        rate_limit._maybe_cleanup = original_cleanup
        rate_limit._CLEANUP_INTERVAL_SECONDS = original_cleanup_interval
        rate_limit._last_cleanup = original_last_cleanup
        rate_limit.time.time = original_time
        monkeypatch.delenv("ELENCHUS_RATE_LIMIT_BACKEND", raising=False)
        rate_limit.reset_rate_limit_store()
        rate_limit.reset_ip(ip)


def test_sqlite_store_shares_limits_across_instances(tmp_path: Path) -> None:
    database_path = tmp_path / "shared-rate-limit.db"
    first = rate_limit.SQLiteRateLimitStore(database_path)
    second = rate_limit.SQLiteRateLimitStore(database_path)
    ip = "203.0.113.15"
    bucket = "create_session"
    max_requests, window = rate_limit._RULES[bucket]

    first.reset_ip(ip)

    assert first.consume(ip, bucket, max_requests, window).allowed is True
    assert second.consume(ip, bucket, max_requests, window).allowed is True
    assert first.consume(ip, bucket, max_requests, window).allowed is True

    blocked = second.consume(ip, bucket, max_requests, window)
    assert blocked.allowed is False
    assert blocked.remaining == 0
    assert blocked.retry_after > 0

    inspected = first.inspect(ip, bucket, max_requests, window)
    assert inspected.allowed is False
    assert inspected.remaining == 0


def test_auto_backend_falls_back_to_memory_when_sqlite_unavailable(monkeypatch) -> None:
    class BrokenSQLiteStore:
        def __init__(self, _path):
            raise OSError("boom")

    monkeypatch.setenv("ELENCHUS_RATE_LIMIT_BACKEND", "auto")
    monkeypatch.setenv("ELENCHUS_RATE_LIMIT_FALLBACK_TO_MEMORY", "true")
    monkeypatch.setattr(rate_limit, "SQLiteRateLimitStore", BrokenSQLiteStore)
    rate_limit.reset_rate_limit_store()

    try:
        store = rate_limit._get_store()
        assert isinstance(store, rate_limit.InMemoryRateLimitStore)
    finally:
        monkeypatch.delenv("ELENCHUS_RATE_LIMIT_BACKEND", raising=False)
        monkeypatch.delenv("ELENCHUS_RATE_LIMIT_FALLBACK_TO_MEMORY", raising=False)
        rate_limit.reset_rate_limit_store()


def test_sqlite_backend_without_fallback_raises_when_store_unavailable(monkeypatch) -> None:
    class BrokenSQLiteStore:
        def __init__(self, _path):
            raise OSError("boom")

    monkeypatch.setenv("ELENCHUS_RATE_LIMIT_BACKEND", "sqlite")
    monkeypatch.setenv("ELENCHUS_RATE_LIMIT_FALLBACK_TO_MEMORY", "false")
    monkeypatch.setattr(rate_limit, "SQLiteRateLimitStore", BrokenSQLiteStore)
    rate_limit.reset_rate_limit_store()

    try:
        raised = False
        try:
            rate_limit._get_store()
        except OSError:
            raised = True
        assert raised is True
    finally:
        monkeypatch.delenv("ELENCHUS_RATE_LIMIT_BACKEND", raising=False)
        monkeypatch.delenv("ELENCHUS_RATE_LIMIT_FALLBACK_TO_MEMORY", raising=False)
        rate_limit.reset_rate_limit_store()


def test_runtime_config_preserves_server_database_url_round_trip() -> None:
    runtime_config = normalize_runtime_config(
        {
            "server": {
                "database_url": "sqlite+aiosqlite:///./custom.db",
            }
        }
    )

    assert runtime_config["server"]["database_url"].endswith("/custom.db")
    assert runtime_config["server"]["database_url"].startswith("sqlite+aiosqlite:///")


def test_settings_reads_database_url_from_runtime_config(runtime_dir: Path) -> None:
    config_path = runtime_dir / "config.json"
    config_path.write_text(
        (
            '{\n'
            '  "server": {\n'
            '    "database_url": "sqlite+aiosqlite:///./shared-rate-limit.db"\n'
            "  }\n"
            "}\n"
        ),
        encoding="utf-8",
    )

    get_settings.cache_clear()
    try:
        settings = get_settings()
        assert settings.env.database_url.endswith("/shared-rate-limit.db")
        assert settings.env.database_url.startswith("sqlite+aiosqlite:///")
    finally:
        get_settings.cache_clear()


def test_auto_backend_uses_memory_for_non_sqlite_database(monkeypatch) -> None:
    monkeypatch.setenv("ELENCHUS_RATE_LIMIT_BACKEND", "auto")
    monkeypatch.setattr(
        rate_limit,
        "get_settings",
        lambda: type(
            "Settings",
            (),
            {
                "rate_limit": type(
                    "RateLimit",
                    (),
                    {"backend": "auto", "fallback_to_memory": True},
                )(),
                "env": type(
                    "Env",
                    (),
                    {"database_url": "postgresql+asyncpg://user:pass@db.example/app"},
                )(),
            },
        )(),
    )

    choice = rate_limit._resolve_backend_choice()
    assert choice.backend == "memory"
    assert choice.reason == "auto-non-sqlite-database-is-not-shareable"


def test_auto_backend_uses_memory_for_sqlite_memory_database(monkeypatch) -> None:
    monkeypatch.setenv("ELENCHUS_RATE_LIMIT_BACKEND", "auto")
    monkeypatch.setattr(
        rate_limit,
        "get_settings",
        lambda: type(
            "Settings",
            (),
            {
                "rate_limit": type(
                    "RateLimit",
                    (),
                    {"backend": "auto", "fallback_to_memory": True},
                )(),
                "env": type(
                    "Env",
                    (),
                    {"database_url": "sqlite+aiosqlite:///:memory:"},
                )(),
            },
        )(),
    )

    choice = rate_limit._resolve_backend_choice()
    assert choice.backend == "memory"
    assert choice.reason == "auto-sqlite-memory-is-not-shareable"
