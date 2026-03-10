"""
Request / Response schemas for the REST API.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# ── Enums ────────────────────────────────────────────────────────

class ExportFormat(str, Enum):
    JSON = "json"
    MARKDOWN = "markdown"


class SessionStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    ERROR = "error"


# ── Request models ───────────────────────────────────────────────

class SessionCreate(BaseModel):
    """POST /api/sessions — create a new debate session."""

    topic: str = Field(..., min_length=1, description="The debate topic")
    participants: list[str] = Field(
        default_factory=lambda: ["proposer", "opposer"],
        description="List of participant role identifiers",
    )
    max_turns: int = Field(default=5, ge=1, le=20)
    agent_configs: dict[str, dict[str, Any]] | None = Field(
        default=None,
        description="Optional overrides for each agent's LLM config (model, api_key, api_base_url). Keys can be roles (proposer/opposer) or agent types (judge/fact_checker)."
    )


# ── Response models ──────────────────────────────────────────────

class SessionResponse(BaseModel):
    """Full session detail."""

    id: str
    topic: str
    participants: list[str]
    max_turns: int
    current_turn: int
    status: SessionStatus
    created_at: datetime
    updated_at: datetime
    dialogue_history: list[dict[str, Any]] = Field(default_factory=list)
    current_scores: dict[str, Any] = Field(default_factory=dict)
    cumulative_scores: dict[str, Any] = Field(default_factory=dict)
    agent_configs: dict[str, dict[str, Any]] | None = Field(default=None)


class SessionListItem(BaseModel):
    """Lightweight session info for list endpoint."""

    id: str
    topic: str
    status: SessionStatus
    current_turn: int
    max_turns: int
    created_at: datetime


class SessionListResponse(BaseModel):
    """GET /api/sessions — list all sessions."""

    sessions: list[SessionListItem]
    total: int
