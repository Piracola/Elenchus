"""
SQLAlchemy ORM models for persistent storage.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone



def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _gen_id() -> str:
    return uuid.uuid4().hex[:12]


