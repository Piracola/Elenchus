from fastapi import APIRouter, Depends, HTTPException, status, Request
from typing import List
from datetime import datetime, timezone

from app.audit import log_audit
from app.dependencies import get_provider_service
from app.middleware.auth import require_auth
from app.services.provider_service import ProviderService
from app.services.demo_model_service import get_demo_models
from app.config import get_settings
from app.models.schemas import (
    ModelConfigCreate,
    ModelConfigResponse,
    ModelConfigUpdate,
    ModelProviderModelsResponse,
    ModelProviderProbeRequest,
    ModelProviderProbeResponse,
)
from app.services.model_probe import fetch_provider_models, format_model_fetch_error

router = APIRouter()

@router.get("", response_model=List[ModelConfigResponse])
async def list_model_configs(
    request: Request,
    service: ProviderService = Depends(get_provider_service)
):
    """List all saved model configurations.

    In demo mode, return only the preset allowed models.
    """
    settings = get_settings()
    if settings.demo.enabled:
        auth_header = request.headers.get("authorization", "")
        token = _extract_token(auth_header) or request.query_params.get("admin_token")
        if not token or not _is_valid_admin(token):
            # Demo mode: return only allowed models
            demo_models = get_demo_models()
            return [ModelConfigResponse(**_demo_to_config(m)) for m in demo_models]
    return await service.list_configs()


def _extract_token(header: str) -> str | None:
    if header.startswith("Bearer "):
        return header[7:].strip()
    return None


def _is_valid_admin(token: str) -> bool:
    from app.middleware.admin_auth import is_valid_admin_token
    return is_valid_admin_token(token)


def _demo_to_config(m: dict) -> dict:
    now = datetime.now(timezone.utc)
    return {
        "id": m.get("id", m.get("model")),
        "name": m.get("name", m.get("model")),
        "provider_type": m.get("provider_type", "openai"),
        "models": m.get("models", [m.get("model")]),
        "api_base_url": m.get("api_base_url", ""),
        "api_key_configured": False,
        "default_max_tokens": m.get("default_max_tokens", 64000),
        "custom_parameters": {
            **(m.get("custom_parameters") or m.get("custom_params") or {}),
            **({"enable_thinking": True} if m.get("enable_thinking") else {}),
        },
        "is_default": False,
        "created_at": m.get("created_at", now),
        "updated_at": m.get("updated_at", now),
    }


async def _resolve_probe_credentials(
    *,
    config_id: str,
    payload: ModelProviderProbeRequest,
    service: ProviderService,
) -> tuple[str, str, str | None]:
    provider = await service.get_config_raw(config_id)
    if provider is None:
        raise HTTPException(status_code=404, detail="Model configuration not found")

    api_key = payload.api_key or str(provider.get("api_key") or "")
    api_base_url = payload.api_base_url
    if api_base_url is None and not payload.model_fields_set.intersection({"api_base_url"}):
        api_base_url = provider.get("api_base_url")
    provider_type = payload.provider_type or str(provider.get("provider_type") or "openai")
    return provider_type, api_key, api_base_url


@router.post("/probe", response_model=ModelProviderProbeResponse)
async def probe_draft_model_provider(
    payload: ModelProviderProbeRequest,
    _auth: bool = Depends(require_auth),
):
    """Check whether draft provider settings can be reached."""
    try:
        models = await fetch_provider_models(
            provider_type=payload.provider_type,
            api_key=payload.api_key or "",
            api_base_url=payload.api_base_url,
        )
    except Exception as error:  # noqa: BLE001 - normalized for the settings UI.
        return ModelProviderProbeResponse(
            ok=False,
            message=format_model_fetch_error(error),
            model_count=0,
        )
    return ModelProviderProbeResponse(
        ok=True,
        message=f"连接正常，获取到 {len(models)} 个模型。",
        model_count=len(models),
    )


@router.post("/remote-models", response_model=ModelProviderModelsResponse)
async def fetch_draft_model_provider_models(
    payload: ModelProviderProbeRequest,
    _auth: bool = Depends(require_auth),
):
    """Fetch a remote model list from draft provider settings."""
    try:
        models = await fetch_provider_models(
            provider_type=payload.provider_type,
            api_key=payload.api_key or "",
            api_base_url=payload.api_base_url,
        )
    except Exception as error:  # noqa: BLE001 - normalized for the settings UI.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=format_model_fetch_error(error),
        ) from error
    return ModelProviderModelsResponse(models=models)


@router.post("/{config_id}/probe", response_model=ModelProviderProbeResponse)
async def probe_model_provider(
    config_id: str,
    payload: ModelProviderProbeRequest,
    service: ProviderService = Depends(get_provider_service),
    _auth: bool = Depends(require_auth),
):
    """Check whether a saved provider can be reached."""
    provider_type, api_key, api_base_url = await _resolve_probe_credentials(
        config_id=config_id,
        payload=payload,
        service=service,
    )
    try:
        models = await fetch_provider_models(
            provider_type=provider_type,
            api_key=api_key,
            api_base_url=api_base_url,
        )
    except Exception as error:  # noqa: BLE001 - normalized for the settings UI.
        return ModelProviderProbeResponse(
            ok=False,
            message=format_model_fetch_error(error),
            model_count=0,
        )
    return ModelProviderProbeResponse(
        ok=True,
        message=f"连接正常，获取到 {len(models)} 个模型。",
        model_count=len(models),
    )


@router.post("/{config_id}/models", response_model=ModelProviderModelsResponse)
async def fetch_model_provider_models(
    config_id: str,
    payload: ModelProviderProbeRequest,
    service: ProviderService = Depends(get_provider_service),
    _auth: bool = Depends(require_auth),
):
    """Fetch the remote model list for a saved provider."""
    provider_type, api_key, api_base_url = await _resolve_probe_credentials(
        config_id=config_id,
        payload=payload,
        service=service,
    )
    try:
        models = await fetch_provider_models(
            provider_type=provider_type,
            api_key=api_key,
            api_base_url=api_base_url,
        )
    except Exception as error:  # noqa: BLE001 - normalized for the settings UI.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=format_model_fetch_error(error),
        ) from error
    return ModelProviderModelsResponse(models=models)

@router.post("", response_model=ModelConfigResponse)
async def create_model_config(
    config_in: ModelConfigCreate,
    service: ProviderService = Depends(get_provider_service),
    _auth: bool = Depends(require_auth),
):
    """Create a new model configuration."""
    try:
        result = await service.create_config(config_in)
        log_audit("model_config_create", payload={"name": config_in.name})
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.put("/{config_id}", response_model=ModelConfigResponse)
async def update_model_config(
    config_id: str,
    config_in: ModelConfigUpdate,
    service: ProviderService = Depends(get_provider_service),
    _auth: bool = Depends(require_auth),
):
    """Update a model configuration."""
    try:
        updated = await service.update_config(config_id, config_in)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    if not updated:
        raise HTTPException(status_code=404, detail="Model configuration not found")
    log_audit("model_config_update", payload={"config_id": config_id})
    return updated

@router.delete("/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_model_config(
    config_id: str,
    service: ProviderService = Depends(get_provider_service),
    _auth: bool = Depends(require_auth),
):
    """Delete a model configuration."""
    deleted = await service.delete_config(config_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Model configuration not found")
    log_audit("model_config_delete", payload={"config_id": config_id})
