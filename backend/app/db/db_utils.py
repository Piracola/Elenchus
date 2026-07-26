"""
SQLAlchemy ORM models for persistent storage.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _gen_id() -> str:
    return uuid.uuid4().hex[:12]


