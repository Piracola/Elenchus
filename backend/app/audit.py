"""Audit logging for administrative and security-sensitive operations."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any

from app.runtime_paths import get_runtime_paths

_audit_logger: logging.Logger | None = None
_lock = Lock()


def _get_audit_logger() -> logging.Logger:
    global _audit_logger
    if _audit_logger is not None:
        return _audit_logger

    with _lock:
        if _audit_logger is not None:
            return _audit_logger

        logger = logging.getLogger("elenchus.audit")
        logger.setLevel(logging.INFO)
        logger.propagate = False

        log_dir = Path(get_runtime_paths().runtime_root) / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        handler = logging.FileHandler(log_dir / "audit.log", encoding="utf-8")
        handler.setLevel(logging.INFO)
        formatter = logging.Formatter("%(message)s")
        handler.setFormatter(formatter)
        logger.addHandler(handler)

        _audit_logger = logger
        return _audit_logger


def log_audit(
    action: str,
    *,
    ip: str = "",
    user: str = "",
    payload: dict[str, Any] | None = None,
) -> None:
    """Append a structured audit log entry."""
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "action": action,
        "ip": ip,
        "user": user,
        "payload": payload or {},
    }
    try:
        _get_audit_logger().info(json.dumps(entry, ensure_ascii=False, default=str))
    except Exception:
        pass
