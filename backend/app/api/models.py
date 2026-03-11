from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.db.database import get_db
from app.db.models import ModelConfig
from app.models.schemas import ModelConfigCreate, ModelConfigResponse, ModelConfigUpdate

router = APIRouter()

@router.get("/", response_model=list[ModelConfigResponse])
async def list_model_configs(db: AsyncSession = Depends(get_db)):
    """List all saved model configurations."""
    result = await db.execute(select(ModelConfig).order_by(ModelConfig.created_at.desc()))
    configs = result.scalars().all()
    return configs

@router.post("/", response_model=ModelConfigResponse)
async def create_model_config(config_in: ModelConfigCreate, db: AsyncSession = Depends(get_db)):
    """Create a new model configuration."""
    # Check if name already exists
    stmt = select(ModelConfig).filter_by(name=config_in.name)
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A model configuration with this name already exists."
        )

    db_obj = ModelConfig(
        name=config_in.name,
        api_key=config_in.api_key,
        api_base_url=config_in.api_base_url,
        models=config_in.models,
    )
    db.add(db_obj)
    await db.commit()
    await db.refresh(db_obj)
    return db_obj

@router.put("/{config_id}", response_model=ModelConfigResponse)
async def update_model_config(
    config_id: str, config_in: ModelConfigUpdate, db: AsyncSession = Depends(get_db)
):
    """Update a model configuration."""
    stmt = select(ModelConfig).filter_by(id=config_id)
    db_obj = (await db.execute(stmt)).scalar_one_or_none()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Model configuration not found")

    update_data = config_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_obj, field, value)

    await db.commit()
    await db.refresh(db_obj)
    return db_obj

@router.delete("/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_model_config(config_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a model configuration."""
    stmt = select(ModelConfig).filter_by(id=config_id)
    db_obj = (await db.execute(stmt)).scalar_one_or_none()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Model configuration not found")

    await db.delete(db_obj)
    await db.commit()
