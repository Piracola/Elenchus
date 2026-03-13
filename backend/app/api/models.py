from fastapi import APIRouter, HTTPException, status
from typing import List

from app.services.provider_service import provider_service
from app.models.schemas import ModelConfigCreate, ModelConfigResponse, ModelConfigUpdate

router = APIRouter()

@router.get("/", response_model=List[ModelConfigResponse])
async def list_model_configs():
    """List all saved model configurations."""
    return provider_service.list_configs()

@router.post("/", response_model=ModelConfigResponse)
async def create_model_config(config_in: ModelConfigCreate):
    """Create a new model configuration."""
    try:
        return provider_service.create_config(config_in)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.put("/{config_id}", response_model=ModelConfigResponse)
async def update_model_config(config_id: str, config_in: ModelConfigUpdate):
    """Update a model configuration."""
    updated = provider_service.update_config(config_id, config_in)
    if not updated:
        raise HTTPException(status_code=404, detail="Model configuration not found")
    return updated

@router.delete("/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_model_config(config_id: str):
    """Delete a model configuration."""
    deleted = provider_service.delete_config(config_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Model configuration not found")

