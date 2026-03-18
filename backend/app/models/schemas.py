"""
Request and response schemas for the REST API.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator


class ExportFormat(str, Enum):
    JSON = "json"
    MARKDOWN = "markdown"


class SessionStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    ERROR = "error"


class SessionCreate(BaseModel):
    """Payload to create a new debate session."""

    topic: str = Field(..., min_length=1, description="The debate topic")
    participants: list[str] = Field(
        default_factory=lambda: ["proposer", "opposer"],
        description="List of participant role identifiers",
    )
    max_turns: int = Field(default=5, ge=1, le=20)
    agent_configs: dict[str, dict[str, Any]] | None = Field(
        default=None,
        description=(
            "Optional runtime overrides keyed by role. Values may include "
            "{model, provider_type, provider_id, api_base_url, custom_name, custom_prompt}."
        ),
    )


class ModelConfigCreate(BaseModel):
    """Payload to create a reusable provider configuration."""

    name: str = Field(..., min_length=1, max_length=100)
    provider_type: str = Field(default="openai", description="Protocol: openai, anthropic, or gemini")
    api_key: str | None = Field(default=None, max_length=255)
    api_base_url: str | None = Field(default=None, max_length=255)
    models: list[str] = Field(default_factory=list)
    is_default: bool = Field(default=False)


class ModelConfigUpdate(BaseModel):
    """Payload to update an existing provider configuration."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    provider_type: str | None = Field(default=None)
    api_key: str | None = Field(default=None, max_length=255)
    api_base_url: str | None = Field(default=None, max_length=255)
    models: list[str] | None = Field(default=None)
    is_default: bool | None = Field(default=None)


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
    shared_knowledge: list[dict[str, Any]] = Field(default_factory=list)
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
    """Paginated session list."""

    sessions: list[SessionListItem]
    total: int


class RuntimeEventResponse(BaseModel):
    """Persisted runtime event envelope."""

    schema_version: str
    event_id: str
    session_id: str
    seq: int
    timestamp: str
    source: str
    type: str
    phase: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class RuntimeEventPageResponse(BaseModel):
    """Paginated runtime event history page."""

    events: list[RuntimeEventResponse]
    total: int
    limit: int
    has_more: bool
    next_before_seq: int | None = None


class ModelConfigResponse(BaseModel):
    """Detail of a persisted provider configuration."""

    id: str
    name: str
    provider_type: str
    api_key: str | None
    api_base_url: str | None
    models: list[str]
    is_default: bool
    created_at: datetime
    updated_at: datetime

    @field_validator("api_key", mode="before")
    @classmethod
    def mask_api_key(cls, value: str | None) -> str | None:
        if not value:
            return value
        if len(value) <= 8:
            return "****"
        return value[:3] + "..." + value[-4:]
