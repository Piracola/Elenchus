from fastapi import APIRouter, Depends, HTTPException, status
from typing import List

from app.dependencies import get_provider_service
from app.services.provider_service import ProviderService
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
    service: ProviderService = Depends(get_provider_service)
):
    """List all saved model configurations."""
    return await service.list_configs()


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
):
    """Create a new model configuration."""
    try:
        result = await service.create_config(config_in)
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
    return updated

@router.delete("/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_model_config(
    config_id: str,
    service: ProviderService = Depends(get_provider_service),
):
    """Delete a model configuration."""
    deleted = await service.delete_config(config_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Model configuration not found")
