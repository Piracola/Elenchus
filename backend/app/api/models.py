from fastapi import APIRouter, Depends, HTTPException, status
from typing import List

from app.dependencies import get_provider_service
from app.services.provider_service import ProviderService
from app.models.schemas import ModelConfigCreate, ModelConfigResponse, ModelConfigUpdate

router = APIRouter()

@router.get("", response_model=List[ModelConfigResponse])
async def list_model_configs(
    service: ProviderService = Depends(get_provider_service)
):
    """List all saved model configurations."""
    return await service.list_configs()

@router.post("", response_model=ModelConfigResponse)
async def create_model_config(
    config_in: ModelConfigCreate,
    service: ProviderService = Depends(get_provider_service)
):
    """Create a new model configuration."""
    try:
        return await service.create_config(config_in)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.put("/{config_id}", response_model=ModelConfigResponse)
async def update_model_config(
    config_id: str,
    config_in: ModelConfigUpdate,
    service: ProviderService = Depends(get_provider_service)
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
    service: ProviderService = Depends(get_provider_service)
):
    """Delete a model configuration."""
    deleted = await service.delete_config(config_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Model configuration not found")
