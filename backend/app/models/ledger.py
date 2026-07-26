from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class SessionRecord(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    topic: Mapped[str] = mapped_column(Text, nullable=False)
    debate_mode: Mapped[str] = mapped_column(String(64), nullable=False, default="standard")
    participants: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    max_turns: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    mode_config: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    agent_configs: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    reasoning_config: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    speech_config: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    runs: Mapped[list[RunRecord]] = relationship(
        "RunRecord",
        back_populates="session",
        cascade="all, delete-orphan",
    )
    documents: Mapped[list[SessionDocumentRecord]] = relationship(
        "SessionDocumentRecord",
        back_populates="session",
        cascade="all, delete-orphan",
    )


class RecentDebateConfigRecord(Base):
    __tablename__ = "recent_debate_configs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    source_session_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    debate_mode: Mapped[str] = mapped_column(String(64), nullable=False, default="standard")
    participants: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    max_turns: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    mode_config: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    agent_configs: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    reasoning_config: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    speech_config: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class RunRecord(Base):
    __tablename__ = "runs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    session_id: Mapped[str] = mapped_column(
        String(32),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(64), nullable=False, default="pending")
    current_turn: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    latest_seq: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_status_message: Mapped[str] = mapped_column(Text, nullable=False, default="")
    last_error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    interrupted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_progress_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    session: Mapped[SessionRecord] = relationship("SessionRecord", back_populates="runs")
    projection: Mapped[RunProjectionRecord | None] = relationship(
        "RunProjectionRecord",
        back_populates="run",
        cascade="all, delete-orphan",
        uselist=False,
    )
    attempts: Mapped[list[RunAttemptRecord]] = relationship(
        "RunAttemptRecord",
        back_populates="run",
        cascade="all, delete-orphan",
    )
    events: Mapped[list[RunEventRecord]] = relationship(
        "RunEventRecord",
        back_populates="run",
        cascade="all, delete-orphan",
    )
    checkpoints: Mapped[list[RunCheckpointRecord]] = relationship(
        "RunCheckpointRecord",
        back_populates="run",
        cascade="all, delete-orphan",
    )
    commands: Mapped[list[RunCommandRecord]] = relationship(
        "RunCommandRecord",
        back_populates="run",
        cascade="all, delete-orphan",
    )


class RunAttemptRecord(Base):
    __tablename__ = "run_attempts"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    run_id: Mapped[str] = mapped_column(
        String(32),
        ForeignKey("runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    attempt_number: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(64), nullable=False, default="pending")
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    run: Mapped[RunRecord] = relationship("RunRecord", back_populates="attempts")


class RunEventRecord(Base):
    __tablename__ = "run_events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    run_id: Mapped[str] = mapped_column(
        String(32),
        ForeignKey("runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    session_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    schema_version: Mapped[str] = mapped_column(String(32), nullable=False, default="v2")
    source: Mapped[str] = mapped_column(String(128), nullable=False, default="runtime")
    type: Mapped[str] = mapped_column(String(128), nullable=False)
    phase: Mapped[str | None] = mapped_column(String(64), nullable=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    run: Mapped[RunRecord] = relationship("RunRecord", back_populates="events")


class RunProjectionRecord(Base):
    __tablename__ = "run_projections"

    run_id: Mapped[str] = mapped_column(
        String(32),
        ForeignKey("runs.id", ondelete="CASCADE"),
        primary_key=True,
    )
    session_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(64), nullable=False, default="pending")
    current_turn: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    latest_seq: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    node: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    status_message: Mapped[str] = mapped_column(Text, nullable=False, default="")
    projection: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    run: Mapped[RunRecord] = relationship("RunRecord", back_populates="projection")


class RunCheckpointRecord(Base):
    __tablename__ = "run_checkpoints"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    run_id: Mapped[str] = mapped_column(
        String(32),
        ForeignKey("runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    session_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    checkpoint_kind: Mapped[str] = mapped_column(String(64), nullable=False, default="node")
    node: Mapped[str] = mapped_column(String(128), nullable=False)
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    turn: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    state_snapshot: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    run: Mapped[RunRecord] = relationship("RunRecord", back_populates="checkpoints")


class RunCommandRecord(Base):
    __tablename__ = "run_commands"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    run_id: Mapped[str] = mapped_column(
        String(32),
        ForeignKey("runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    session_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    command_type: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(64), nullable=False, default="pending")
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    run: Mapped[RunRecord] = relationship("RunRecord", back_populates="commands")


class SessionDocumentRecord(Base):
    __tablename__ = "session_documents"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    session_id: Mapped[str] = mapped_column(
        String(32),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    filename: Mapped[str] = mapped_column(Text, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(128), nullable=False, default="text/plain")
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(64), nullable=False, default="uploaded")
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    normalized_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary_short: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    session: Mapped[SessionRecord] = relationship("SessionRecord", back_populates="documents")


Index("ix_run_events_run_seq", RunEventRecord.run_id, RunEventRecord.seq, unique=True)
Index("ix_run_attempts_run_attempt", RunAttemptRecord.run_id, RunAttemptRecord.attempt_number, unique=True)
Index("ix_run_checkpoints_run_seq", RunCheckpointRecord.run_id, RunCheckpointRecord.seq)
# Pending-command polling happens at every graph node boundary.
Index("ix_run_commands_run_status", RunCommandRecord.run_id, RunCommandRecord.status)
