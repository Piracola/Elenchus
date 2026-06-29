"""
Request and response schemas for the REST API.
"""

from __future__ import annotations

import json
from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator


class ExportFormat(str, Enum):
    JSON = "json"
    MARKDOWN = "markdown"
    HTML = "html"


class SessionStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    ERROR = "error"


class DebateMode(str, Enum):
    STANDARD = "standard"
    SOPHISTRY_EXPERIMENT = "sophistry_experiment"


class DocumentStatus(str, Enum):
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    PROCESSED = "processed"
    FAILED = "failed"


class ReasoningConfig(BaseModel):
    """Internal reasoning behavior for one debate."""

    consensus_enabled: bool = True


class SpeechConfig(BaseModel):
    """Optional per-role visible speech length guidance."""

    proposer_max_chars: int = Field(default=0, ge=0, le=20000)
    opposer_max_chars: int = Field(default=0, ge=0, le=20000)


class SophistryModeConfig(BaseModel):
    """Optional knobs for the standalone sophistry experiment mode."""

    seed_reference_enabled: bool = True
    observer_enabled: bool = True
    artifact_detail_level: str = Field(default="full")


def _blank_to_none(value: Any) -> Any:
    if isinstance(value, str) and not value.strip():
        return None
    return value


def _normalize_default_max_tokens(value: Any) -> int:
    if value is None:
        return 64000
    if isinstance(value, str) and not value.strip():
        return 64000
    try:
        parsed_float = float(value)
    except (TypeError, ValueError):
        return 64000
    if not parsed_float.is_integer():
        return 64000
    parsed = int(parsed_float)
    return parsed if parsed > 0 else 64000


def _normalize_models(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        parts = value.replace("\n", ",").split(",")
        return [part.strip() for part in parts if part.strip()]
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return []


def _normalize_custom_parameters(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return {}
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


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
    reasoning_config: ReasoningConfig = Field(default_factory=ReasoningConfig)
    speech_config: SpeechConfig = Field(default_factory=SpeechConfig)
    debate_mode: DebateMode = Field(default=DebateMode.STANDARD)
    mode_config: dict[str, Any] = Field(default_factory=dict)


class SessionAgentConfigsUpdate(BaseModel):
    """Payload to update per-agent model overrides for future runtime calls."""

    agent_configs: dict[str, dict[str, Any]] | None = Field(default=None)


class ModelConfigCreate(BaseModel):
    """Payload to create a reusable provider configuration."""

    name: str
    provider_type: str = Field(default="openai", description="Protocol: openai, anthropic, or gemini")
    api_key: str | None = None
    api_base_url: str | None = None
    default_max_tokens: int = Field(default=64000)
    custom_parameters: dict[str, Any] = Field(default_factory=dict)
    models: list[str] = Field(default_factory=list)
    is_default: bool = Field(default=False)

    @field_validator("name", mode="before")
    @classmethod
    def _normalize_name(cls, value: Any) -> str:
        return str(value or "").strip()

    @field_validator("provider_type", mode="before")
    @classmethod
    def _normalize_provider_type(cls, value: Any) -> str:
        provider_type = str(value or "").strip().lower()
        return provider_type or "openai"

    @field_validator("api_key", "api_base_url", mode="before")
    @classmethod
    def _normalize_optional_text(cls, value: Any) -> Any:
        value = _blank_to_none(value)
        return value.strip() if isinstance(value, str) else value

    @field_validator("default_max_tokens", mode="before")
    @classmethod
    def _normalize_tokens(cls, value: Any) -> int:
        return _normalize_default_max_tokens(value)

    @field_validator("custom_parameters", mode="before")
    @classmethod
    def _normalize_params(cls, value: Any) -> dict[str, Any]:
        return _normalize_custom_parameters(value)

    @field_validator("models", mode="before")
    @classmethod
    def _normalize_model_list(cls, value: Any) -> list[str]:
        return _normalize_models(value)


class ModelConfigUpdate(BaseModel):
    """Payload to update an existing provider configuration."""

    name: str | None = None
    provider_type: str | None = Field(default=None)
    api_key: str | None = None
    clear_api_key: bool | None = Field(default=None)
    api_base_url: str | None = None
    default_max_tokens: int | None = None
    custom_parameters: dict[str, Any] | None = Field(default=None)
    models: list[str] | None = Field(default=None)
    is_default: bool | None = Field(default=None)

    @field_validator("name", mode="before")
    @classmethod
    def _normalize_name(cls, value: Any) -> Any:
        if value is None:
            return None
        return str(value).strip()

    @field_validator("provider_type", mode="before")
    @classmethod
    def _normalize_provider_type(cls, value: Any) -> Any:
        if value is None:
            return None
        provider_type = str(value or "").strip().lower()
        return provider_type or None

    @field_validator("api_key", "api_base_url", mode="before")
    @classmethod
    def _normalize_optional_text(cls, value: Any) -> Any:
        value = _blank_to_none(value)
        return value.strip() if isinstance(value, str) else value

    @field_validator("default_max_tokens", mode="before")
    @classmethod
    def _normalize_tokens(cls, value: Any) -> Any:
        if value is None:
            return None
        return _normalize_default_max_tokens(value)

    @field_validator("custom_parameters", mode="before")
    @classmethod
    def _normalize_params(cls, value: Any) -> Any:
        if value is None:
            return None
        return _normalize_custom_parameters(value)

    @field_validator("models", mode="before")
    @classmethod
    def _normalize_model_list(cls, value: Any) -> Any:
        if value is None:
            return None
        return _normalize_models(value)


class ModelProviderProbeRequest(BaseModel):
    """Payload for checking a provider connection or fetching remote models."""

    provider_type: str = Field(default="openai")
    api_key: str | None = None
    api_base_url: str | None = None

    @field_validator("provider_type", mode="before")
    @classmethod
    def _normalize_provider_type(cls, value: Any) -> str:
        provider_type = str(value or "").strip().lower()
        return provider_type or "openai"

    @field_validator("api_key", "api_base_url", mode="before")
    @classmethod
    def _normalize_optional_text(cls, value: Any) -> Any:
        value = _blank_to_none(value)
        return value.strip() if isinstance(value, str) else value


class ModelProviderProbeResponse(BaseModel):
    """Connectivity check result for a provider."""

    ok: bool
    message: str
    model_count: int = 0


class ModelProviderModelsResponse(BaseModel):
    """Remote model list for a provider."""

    models: list[str]


class SessionResponse(BaseModel):
    """Full session detail."""

    id: str
    topic: str
    debate_mode: DebateMode = DebateMode.STANDARD
    mode_config: dict[str, Any] = Field(default_factory=dict)
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
    reasoning_config: ReasoningConfig = Field(default_factory=ReasoningConfig)
    speech_config: SpeechConfig = Field(default_factory=SpeechConfig)
    mode_artifacts: list[dict[str, Any]] = Field(default_factory=list)
    current_mode_report: dict[str, Any] | None = None
    final_mode_report: dict[str, Any] | None = None


class SessionListItem(BaseModel):
    """Lightweight session info for list endpoint."""

    id: str
    topic: str
    debate_mode: DebateMode = DebateMode.STANDARD
    status: SessionStatus
    current_turn: int
    max_turns: int
    created_at: datetime


class SessionListResponse(BaseModel):
    """Paginated session list."""

    sessions: list[SessionListItem]
    total: int


class SessionDocumentListItem(BaseModel):
    """Lightweight document info for per-session reference files."""

    id: str
    session_id: str
    filename: str
    mime_type: str
    size_bytes: int
    status: DocumentStatus
    summary_short: str | None = None
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime


class SessionDocumentResponse(SessionDocumentListItem):
    """Full document detail including extracted text."""

    raw_text: str | None = None
    normalized_text: str | None = None


class SessionDocumentListResponse(BaseModel):
    """Paginated-like response for session documents."""

    documents: list[SessionDocumentListItem]


class ModelConfigResponse(BaseModel):
    """Detail of a persisted provider configuration safe for REST responses."""

    id: str
    name: str
    provider_type: str
    api_key_configured: bool
    api_base_url: str | None
    default_max_tokens: int = 64000
    custom_parameters: dict[str, Any] = Field(default_factory=dict)
    models: list[str]
    is_default: bool
    created_at: datetime
    updated_at: datetime
