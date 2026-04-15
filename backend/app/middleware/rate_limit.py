"""
Simple IP-based rate limiter for demo mode abuse prevention.

Uses an in-memory token bucket — no external dependencies.
Includes periodic cleanup to prevent memory leaks from stale IP entries.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict
from typing import Literal

# Per-IP counters: { ip: { key: [timestamp, ...] } }
_buckets: dict[str, dict[str, list[float]]] = defaultdict(dict)
_buckets_lock = threading.Lock()

# Rate limit rules: (max_requests, window_seconds)
_RULES: dict[str, tuple[int, int]] = {
    "create_session": (3, 300),       # 3 per 5 minutes
    "ws_connect": (10, 60),           # 10 per minute
    "ws_message": (20, 10),           # 20 per 10 seconds
    "admin_login": (5, 60),           # 5 per minute
    "default": (30, 60),              # 30 per minute fallback
}

# Cleanup configuration
_CLEANUP_INTERVAL_SECONDS = 600  # Run cleanup every 10 minutes
_MAX_BUCKET_AGE_SECONDS = 3600   # Remove IP entries idle for over 1 hour
_last_cleanup: float = 0.0


def _maybe_cleanup() -> None:
    """Periodically remove stale IP entries to prevent memory leaks."""
    global _last_cleanup
    now = time.time()
    if now - _last_cleanup < _CLEANUP_INTERVAL_SECONDS:
        return
    _last_cleanup = now

    stale_ips: list[str] = []
    for ip, buckets in _buckets.items():
        # Check if all buckets are empty or expired
        has_active = False
        for key in list(buckets.keys()):
            window = _RULES.get(key, _RULES["default"])[1]
            buckets[key] = [t for t in buckets[key] if now - t < window]
            if buckets[key]:
                has_active = True
            else:
                del buckets[key]
        if not has_active:
            # Check if the entire IP entry has been idle long enough
            stale_ips.append(ip)

    for ip in stale_ips:
        del _buckets[ip]


def check_rate_limit(ip: str, bucket: str = "default") -> bool:
    """Return True if the request is allowed, False if rate limited."""
    max_requests, window = _RULES.get(bucket, _RULES["default"])
    now = time.time()

    _maybe_cleanup()

    if bucket not in _buckets[ip]:
        _buckets[ip][bucket] = []

    timestamps = _buckets[ip][bucket]
    # Remove expired entries
    _buckets[ip][bucket] = [t for t in timestamps if now - t < window]
    timestamps = _buckets[ip][bucket]

    if len(timestamps) >= max_requests:
        return False

    timestamps.append(now)
    return True


def get_remaining(ip: str, bucket: str = "default") -> int:
    """Return remaining requests in the current window."""
    max_requests, window = _RULES.get(bucket, _RULES["default"])
    now = time.time()

    if bucket not in _buckets[ip]:
        return max_requests

    timestamps = [t for t in _buckets[ip][bucket] if now - t < window]
    _buckets[ip][bucket] = timestamps
    return max(0, max_requests - len(timestamps))


def reset_ip(ip: str) -> None:
    """Clear all rate limit data for an IP."""
    _buckets.pop(ip, None)
