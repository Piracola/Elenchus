from fastapi import APIRouter, Depends, HTTPException, status, Request
from typing import List

from app.audit import log_audit
from app.dependencies import get_provider_service
from app.middleware.auth import require_auth
from app.services.provider_service import ProviderService
from app.services.demo_model_service import get_demo_models
from app.config import get_settings
from app.models.schemas import ModelConfigCreate, ModelConfigResponse, ModelConfigUpdate

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
    return {
        "id": m.get("id", m.get("model")),
        "name": m.get("name", m.get("model")),
        "provider_type": m.get("provider_type", "openai"),
        "models": m.get("models", [m.get("model")]),
        "api_base_url": m.get("api_base_url", ""),
        "api_key_masked": False,
        "default_max_tokens": m.get("default_max_tokens", 64000),
        "enable_thinking": m.get("enable_thinking", False),
        "custom_params": m.get("custom_params", {}),
        "is_default": False,
    }

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
