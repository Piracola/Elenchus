"""
SQLAlchemy ORM models for persistent storage.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _gen_id() -> str:
    return uuid.uuid4().hex[:12]


class SessionRecord(Base):
    """Persisted debate session."""

    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(12), primary_key=True, default=_gen_id)
    topic: Mapped[str] = mapped_column(Text, nullable=False)
    participants: Mapped[dict] = mapped_column(JSON, default=list)
    max_turns: Mapped[int] = mapped_column(Integer, default=5)
    current_turn: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="pending")

    # Serialised GraphState snapshot (JSON blob containing dialogue_history, shared_knowledge, etc.)
    state_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )



