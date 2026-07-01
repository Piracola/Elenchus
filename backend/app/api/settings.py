"""Runtime settings API endpoints."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.config import _clear_settings_cache, get_settings
from app.models.schemas import ContextRuntimeConfig
from app.runtime_config_store import update_runtime_config

router = APIRouter(prefix="/settings", tags=["settings"])


class DebateSettingsResponse(BaseModel):
    context_runtime: ContextRuntimeConfig = Field(default_factory=ContextRuntimeConfig)


class RuntimeSettingsResponse(BaseModel):
    debate: DebateSettingsResponse


class DebateSettingsUpdate(BaseModel):
    context_runtime: ContextRuntimeConfig = Field(default_factory=ContextRuntimeConfig)


class RuntimeSettingsUpdateRequest(BaseModel):
    debate: DebateSettingsUpdate = Field(default_factory=DebateSettingsUpdate)


def _build_runtime_settings_response() -> RuntimeSettingsResponse:
    settings = get_settings()
    return RuntimeSettingsResponse(
        debate=DebateSettingsResponse(
            context_runtime=settings.debate.context_runtime,
        )
    )


@router.get("", response_model=RuntimeSettingsResponse)
async def get_runtime_settings():
    """Return runtime-editable settings used by the application shell."""
    return _build_runtime_settings_response()


@router.put("", response_model=RuntimeSettingsResponse)
async def update_runtime_settings(
    request: RuntimeSettingsUpdateRequest,
):
    """Persist runtime-editable settings for context engineering behavior."""

    context_runtime = request.debate.context_runtime.model_dump()
    update_runtime_config(
        lambda config: {
            **config,
            "debate": {
                **dict(config.get("debate") or {}),
                "context_runtime": context_runtime,
            },
        }
    )
    _clear_settings_cache()
    return _build_runtime_settings_response()
