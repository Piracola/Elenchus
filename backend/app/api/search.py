"""
Search configuration API routes.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.dependencies import get_search_factory
from app.search.factory import SearchProviderFactory, ProviderType

router = APIRouter(prefix="/search", tags=["search"])


class SearchConfigResponse(BaseModel):
    """Response model for search configuration."""
    provider: str
    available_providers: list[dict]


class UpdateProviderRequest(BaseModel):
    """Request model for updating search provider."""
    provider: str


@router.get("/config", response_model=SearchConfigResponse)
async def get_search_config(
    factory: SearchProviderFactory = Depends(get_search_factory)
):
    """Get current search configuration and available providers."""
    providers = await factory.get_available_providers()
    return SearchConfigResponse(
        provider=factory.get_current_provider(),
        available_providers=[p.to_dict() for p in providers],
    )


@router.post("/config")
async def update_search_config(
    request: UpdateProviderRequest,
    factory: SearchProviderFactory = Depends(get_search_factory)
):
    """Update current search engine."""
    success = factory.set_provider(request.provider)
    if not success:
        raise HTTPException(status_code=400, detail=f"Invalid provider: {request.provider}")
    return {"status": "ok", "provider": request.provider}


@router.get("/providers")
async def list_providers(
    factory: SearchProviderFactory = Depends(get_search_factory)
):
    """List all available search engines and their status."""
    providers = await factory.get_available_providers()
    return [p.to_dict() for p in providers]


@router.get("/health")
async def search_health(
    factory: SearchProviderFactory = Depends(get_search_factory)
):
    """Check current search engine health status."""
    provider = await factory.get_provider()
    if provider is None:
        return {"status": "unavailable", "provider": None}
    return {
        "status": "ok",
        "provider": factory.get_current_provider(),
    }
