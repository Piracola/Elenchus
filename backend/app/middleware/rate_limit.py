"""
Shared-capable IP-based rate limiter for demo abuse prevention.

Auto mode only uses a shared backend when the configured app database is a
shareable SQLite file. Non-SQLite URLs and SQLite in-memory URLs fall back to
process-local memory so the behavior stays honest.
"""

from __future__ import annotations

import logging
import math
import sqlite3
import threading
import time
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from app.config import get_settings
from app.runtime_paths import get_runtime_paths

logger = logging.getLogger(__name__)

# Per-IP counters: { ip: { key: [timestamp, ...] } }
_buckets: dict[str, dict[str, list[float]]] = defaultdict(dict)
_buckets_lock = threading.Lock()

# Rate limit rules: (max_requests, window_seconds)
_RULES: dict[str, tuple[int, int | float]] = {
    "create_session": (3, 300),       # 3 per 5 minutes
    "ws_connect": (10, 60),           # 10 per minute
    "ws_message": (20, 10),           # 20 per 10 seconds
    "admin_login": (5, 60),           # 5 per minute
    "default": (30, 60),              # 30 per minute fallback
}

# Cleanup configuration
_CLEANUP_INTERVAL_SECONDS = 600
_last_cleanup: float = 0.0

_STORE_LOCK = threading.Lock()
_STORE: RateLimitStore | None = None
_STORE_SIGNATURE: tuple[str, str, bool] | None = None


@dataclass(frozen=True)
class RateLimitDecision:
    """Atomic rate-limit decision with metadata for callers."""

    allowed: bool
    limit: int
    remaining: int
    retry_after: int
    window_seconds: int | float

    def as_headers(self) -> dict[str, str]:
        headers = {
            "X-RateLimit-Limit": str(self.limit),
            "X-RateLimit-Remaining": str(self.remaining),
        }
        if self.retry_after > 0:
            headers["Retry-After"] = str(self.retry_after)
        return headers

    def as_metadata(self) -> dict[str, int | float]:
        return {
            "limit": self.limit,
            "remaining": self.remaining,
            "retry_after": self.retry_after,
            "window_seconds": self.window_seconds,
        }


class RateLimitStore(Protocol):
    def inspect(self, ip: str, bucket: str, max_requests: int, window: int | float) -> RateLimitDecision:
        ...

    def consume(self, ip: str, bucket: str, max_requests: int, window: int | float) -> RateLimitDecision:
        ...

    def reset_ip(self, ip: str) -> None:
        ...


@dataclass(frozen=True)
class RateLimitBackendChoice:
    backend: str
    sqlite_path: Path | None
    reason: str


def _window_to_retry_after(window: int | float, now: float, oldest_timestamp: float) -> int:
    return max(1, math.ceil(float(window) - (now - oldest_timestamp)))


def _sqlite_database_path(database_url: str) -> Path | None:
    normalized = (database_url or "").strip()
    prefixes = ("sqlite+aiosqlite:///", "sqlite:///")
    for prefix in prefixes:
        if normalized.startswith(prefix):
            raw_path = normalized[len(prefix) :]
            if raw_path == ":memory:":
                return None
            return Path(raw_path).expanduser().resolve()
    return None


def _resolve_backend_choice() -> RateLimitBackendChoice:
    settings = get_settings()
    backend_name = settings.rate_limit.backend
    database_url = (settings.env.database_url or "").strip()

    if backend_name == "memory":
        return RateLimitBackendChoice(
            backend="memory",
            sqlite_path=None,
            reason="configured-memory-backend",
        )

    sqlite_path = _sqlite_database_path(database_url)

    if backend_name == "sqlite":
        default_path = sqlite_path or get_runtime_paths().default_database_file
        reason = "configured-sqlite-database-url" if sqlite_path else "default-runtime-sqlite-file"
        return RateLimitBackendChoice(
            backend="sqlite",
            sqlite_path=default_path,
            reason=reason,
        )

    if sqlite_path is not None:
        return RateLimitBackendChoice(
            backend="sqlite",
            sqlite_path=sqlite_path,
            reason="auto-shareable-sqlite-database-url",
        )

    if database_url.startswith("sqlite") and ":memory:" in database_url:
        return RateLimitBackendChoice(
            backend="memory",
            sqlite_path=None,
            reason="auto-sqlite-memory-is-not-shareable",
        )

    if database_url:
        return RateLimitBackendChoice(
            backend="memory",
            sqlite_path=None,
            reason="auto-non-sqlite-database-is-not-shareable",
        )

    return RateLimitBackendChoice(
        backend="sqlite",
        sqlite_path=get_runtime_paths().default_database_file,
        reason="auto-default-runtime-sqlite-file",
    )


def _normalize_window(window: int | float) -> float:
    return float(window)


def _maybe_cleanup() -> None:
    global _last_cleanup
    now = time.time()
    if now - _last_cleanup < _CLEANUP_INTERVAL_SECONDS:
        return
    _last_cleanup = now

    stale_ips: list[str] = []
    for ip, buckets in _buckets.items():
        has_active = False
        for key in list(buckets.keys()):
            window = _normalize_window(_RULES.get(key, _RULES["default"])[1])
            buckets[key] = [t for t in buckets[key] if now - t < window]
            if buckets[key]:
                has_active = True
            else:
                del buckets[key]
        if not has_active:
            stale_ips.append(ip)

    for ip in stale_ips:
        del _buckets[ip]


def _get_bucket_timestamps(now: float, ip: str, bucket: str, window: int | float) -> list[float]:
    ip_buckets = _buckets.get(ip)
    if not ip_buckets or bucket not in ip_buckets:
        return []

    timestamps = [t for t in ip_buckets[bucket] if now - t < _normalize_window(window)]
    if timestamps:
        ip_buckets[bucket] = timestamps
    else:
        del ip_buckets[bucket]
        if not ip_buckets:
            _buckets.pop(ip, None)
    return timestamps


class InMemoryRateLimitStore:
    def inspect(self, ip: str, bucket: str, max_requests: int, window: int | float) -> RateLimitDecision:
        with _buckets_lock:
            now = time.time()
            timestamps = _get_bucket_timestamps(now, ip, bucket, window)
            retry_after = 0
            if len(timestamps) >= max_requests:
                retry_after = _window_to_retry_after(window, now, timestamps[0])
            remaining = max(0, max_requests - len(timestamps))
            return RateLimitDecision(
                allowed=len(timestamps) < max_requests,
                limit=max_requests,
                remaining=remaining,
                retry_after=retry_after,
                window_seconds=window,
            )

    def consume(self, ip: str, bucket: str, max_requests: int, window: int | float) -> RateLimitDecision:
        with _buckets_lock:
            _maybe_cleanup()
            now = time.time()

            if bucket not in _buckets[ip]:
                _buckets[ip][bucket] = []

            timestamps = [t for t in _buckets[ip][bucket] if now - t < _normalize_window(window)]
            _buckets[ip][bucket] = timestamps

            if len(timestamps) >= max_requests:
                return RateLimitDecision(
                    allowed=False,
                    limit=max_requests,
                    remaining=0,
                    retry_after=_window_to_retry_after(window, now, timestamps[0]),
                    window_seconds=window,
                )

            timestamps.append(now)
            remaining = max_requests - len(timestamps)
            return RateLimitDecision(
                allowed=True,
                limit=max_requests,
                remaining=remaining,
                retry_after=0,
                window_seconds=window,
            )

    def reset_ip(self, ip: str) -> None:
        with _buckets_lock:
            _buckets.pop(ip, None)


class SQLiteRateLimitStore:
    def __init__(self, database_path: Path) -> None:
        self._database_path = database_path
        self._database_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._ensure_schema()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(
            self._database_path,
            timeout=30,
            isolation_level=None,
            check_same_thread=False,
        )
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA synchronous=NORMAL")
        return connection

    def _ensure_schema(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS rate_limit_events (
                    ip TEXT NOT NULL,
                    bucket TEXT NOT NULL,
                    ts REAL NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_rate_limit_events_ip_bucket_ts
                ON rate_limit_events(ip, bucket, ts)
                """
            )

    def _trim(self, connection: sqlite3.Connection, ip: str, bucket: str, cutoff: float) -> None:
        connection.execute(
            "DELETE FROM rate_limit_events WHERE ip = ? AND bucket = ? AND ts <= ?",
            (ip, bucket, cutoff),
        )

    def inspect(self, ip: str, bucket: str, max_requests: int, window: int | float) -> RateLimitDecision:
        now = time.time()
        cutoff = now - _normalize_window(window)
        with self._lock, self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            self._trim(connection, ip, bucket, cutoff)
            cursor = connection.execute(
                """
                SELECT ts
                FROM rate_limit_events
                WHERE ip = ? AND bucket = ?
                ORDER BY ts ASC
                """,
                (ip, bucket),
            )
            timestamps = [float(row[0]) for row in cursor.fetchall()]
            connection.commit()

        retry_after = 0
        if len(timestamps) >= max_requests:
            retry_after = _window_to_retry_after(window, now, timestamps[0])
        remaining = max(0, max_requests - len(timestamps))
        return RateLimitDecision(
            allowed=len(timestamps) < max_requests,
            limit=max_requests,
            remaining=remaining,
            retry_after=retry_after,
            window_seconds=window,
        )

    def consume(self, ip: str, bucket: str, max_requests: int, window: int | float) -> RateLimitDecision:
        now = time.time()
        cutoff = now - _normalize_window(window)
        with self._lock, self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            self._trim(connection, ip, bucket, cutoff)
            cursor = connection.execute(
                """
                SELECT ts
                FROM rate_limit_events
                WHERE ip = ? AND bucket = ?
                ORDER BY ts ASC
                """,
                (ip, bucket),
            )
            timestamps = [float(row[0]) for row in cursor.fetchall()]
            if len(timestamps) >= max_requests:
                connection.commit()
                return RateLimitDecision(
                    allowed=False,
                    limit=max_requests,
                    remaining=0,
                    retry_after=_window_to_retry_after(window, now, timestamps[0]),
                    window_seconds=window,
                )

            connection.execute(
                "INSERT INTO rate_limit_events(ip, bucket, ts) VALUES(?, ?, ?)",
                (ip, bucket, now),
            )
            connection.commit()

        remaining = max_requests - (len(timestamps) + 1)
        return RateLimitDecision(
            allowed=True,
            limit=max_requests,
            remaining=remaining,
            retry_after=0,
            window_seconds=window,
        )

    def reset_ip(self, ip: str) -> None:
        with self._lock, self._connect() as connection:
            connection.execute("DELETE FROM rate_limit_events WHERE ip = ?", (ip,))


def _build_store() -> RateLimitStore:
    settings = get_settings()
    choice = _resolve_backend_choice()

    if choice.backend == "memory":
        return InMemoryRateLimitStore()

    if choice.backend == "sqlite":
        try:
            if choice.sqlite_path is None:
                raise ValueError("SQLite in-memory database cannot be shared across instances.")
            return SQLiteRateLimitStore(choice.sqlite_path)
        except Exception as exc:
            if settings.rate_limit.fallback_to_memory:
                logger.warning(
                    "Rate-limit backend %s unavailable, falling back to in-memory storage: %s",
                    choice.reason,
                    exc,
                )
                return InMemoryRateLimitStore()
            raise

    return InMemoryRateLimitStore()


def _current_store_signature() -> tuple[str, str, bool]:
    settings = get_settings()
    return (
        settings.rate_limit.backend,
        settings.env.database_url,
        settings.rate_limit.fallback_to_memory,
    )


def _get_store() -> RateLimitStore:
    global _STORE, _STORE_SIGNATURE
    signature = _current_store_signature()
    with _STORE_LOCK:
        if _STORE is None or _STORE_SIGNATURE != signature:
            _STORE = _build_store()
            _STORE_SIGNATURE = signature
        return _STORE


def reset_rate_limit_store() -> None:
    global _STORE, _STORE_SIGNATURE
    with _STORE_LOCK:
        _STORE = None
        _STORE_SIGNATURE = None


def get_rate_limit_status(ip: str, bucket: str = "default") -> RateLimitDecision:
    max_requests, window = _RULES.get(bucket, _RULES["default"])
    return _get_store().inspect(ip, bucket, max_requests, window)


def consume_rate_limit(ip: str, bucket: str = "default") -> RateLimitDecision:
    max_requests, window = _RULES.get(bucket, _RULES["default"])
    return _get_store().consume(ip, bucket, max_requests, window)


def check_rate_limit(ip: str, bucket: str = "default") -> bool:
    return consume_rate_limit(ip, bucket).allowed


def get_remaining(ip: str, bucket: str = "default") -> int:
    return get_rate_limit_status(ip, bucket).remaining


def reset_ip(ip: str) -> None:
    _get_store().reset_ip(ip)
