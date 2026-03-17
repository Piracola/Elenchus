"""
Request / Response schemas for the REST API.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, EmailStr, Field, field_validator


# ── Enums ────────────────────────────────────────────────────────

class ExportFormat(str, Enum):
    JSON = "json"
    MARKDOWN = "markdown"


class SessionStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    ERROR = "error"


# ── User Request/Response models ─────────────────────────────────

class UserRegister(BaseModel):
    """POST /api/users/register — create a new user account."""

    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., min_length=8, max_length=128, description="User password")


class UserLogin(BaseModel):
    """POST /api/users/login — authenticate user."""

    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., description="User password")


class UserResponse(BaseModel):
    """User information response."""

    id: str
    email: str
    is_active: bool
    is_superuser: bool
    created_at: datetime
    updated_at: datetime


class TokenResponse(BaseModel):
    """JWT token response for login."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class AuthStatusResponse(BaseModel):
    """Authentication status response."""

    auth_enabled: bool
    authenticated: bool
    user: UserResponse | None = None


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
        description="Optional overrides. Keys can be roles (proposer_1/opposer_1). Values: {model, api_key, api_base_url, custom_name, custom_prompt}"
    )


class ModelConfigCreate(BaseModel):
    """Payload to create a new reusable model configuration (Provider settings)."""

    name: str = Field(..., min_length=1, max_length=100)
    provider_type: str = Field(default="openai", description="Protocol: openai, anthropic, or gemini")
    api_key: str | None = Field(default=None, max_length=255)
    api_base_url: str | None = Field(default=None, max_length=255)
    models: list[str] = Field(default_factory=list)
    is_default: bool = Field(default=False)


class ModelConfigUpdate(BaseModel):
    """Payload to update an existing model configuration (Provider settings)."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    provider_type: str | None = Field(default=None)
    api_key: str | None = Field(default=None, max_length=255)
    api_base_url: str | None = Field(default=None, max_length=255)
    models: list[str] | None = Field(default=None)
    is_default: bool | None = Field(default=None)


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
    """GET /api/sessions — list all sessions."""

    sessions: list[SessionListItem]
    total: int


class ModelConfigResponse(BaseModel):
    """Detail of a persisted model configuration."""

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
    def mask_api_key(cls, v: str | None) -> str | None:
        if not v:
            return v
        if len(v) <= 8:
            return "****"
        return v[:3] + "..." + v[-4:]

