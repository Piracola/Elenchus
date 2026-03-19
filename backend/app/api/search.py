"""
Search configuration API routes.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.config import get_search_provider_settings_snapshot, persist_search_settings
from app.dependencies import get_search_factory
from app.search.factory import SearchProviderFactory

router = APIRouter(prefix="/search", tags=["search"])


class SearXNGSettingsResponse(BaseModel):
    base_url: str
    api_key_configured: bool


class TavilySettingsResponse(BaseModel):
    api_url: str
    api_key_configured: bool


class SearchProviderSettingsResponse(BaseModel):
    searxng: SearXNGSettingsResponse
    tavily: TavilySettingsResponse


class SearchConfigResponse(BaseModel):
    """Response model for search configuration."""

    provider: str
    available_providers: list[dict]
    provider_settings: SearchProviderSettingsResponse


class UpdateProviderRequest(BaseModel):
    """Request model for updating search provider."""

    provider: str


class SearXNGSettingsUpdate(BaseModel):
    base_url: str | None = None
    api_key: str | None = None
    clear_api_key: bool = False


class TavilySettingsUpdate(BaseModel):
    api_url: str | None = None
    api_key: str | None = None
    clear_api_key: bool = False


class SearchProviderSettingsUpdate(BaseModel):
    searxng: SearXNGSettingsUpdate = Field(default_factory=SearXNGSettingsUpdate)
    tavily: TavilySettingsUpdate = Field(default_factory=TavilySettingsUpdate)


class UpdateSearchSettingsRequest(BaseModel):
    provider: str | None = None
    provider_settings: SearchProviderSettingsUpdate = Field(default_factory=SearchProviderSettingsUpdate)


async def _build_search_config_response(factory: SearchProviderFactory) -> SearchConfigResponse:
    providers = await factory.get_available_providers()
    return SearchConfigResponse(
        provider=factory.get_current_provider(),
        available_providers=[p.to_dict() for p in providers],
        provider_settings=SearchProviderSettingsResponse.model_validate(
            get_search_provider_settings_snapshot()
        ),
    )


@router.get("/config", response_model=SearchConfigResponse)
async def get_search_config(
    factory: SearchProviderFactory = Depends(get_search_factory),
):
    """Get current search configuration and available providers."""

    return await _build_search_config_response(factory)


@router.post("/config")
async def update_search_config(
    request: UpdateProviderRequest,
    factory: SearchProviderFactory = Depends(get_search_factory),
):
    """Update current search engine."""

    success = factory.set_provider(request.provider)
    if not success:
        raise HTTPException(status_code=400, detail=f"Invalid provider: {request.provider}")
    return {"status": "ok", "provider": request.provider}


@router.put("/config", response_model=SearchConfigResponse)
async def update_search_settings(
    request: UpdateSearchSettingsRequest,
    factory: SearchProviderFactory = Depends(get_search_factory),
):
    """Update runtime-editable provider settings and rebuild the provider factory."""

    persist_search_settings(
        provider=request.provider,
        searxng_base_url=request.provider_settings.searxng.base_url,
        searxng_api_key=request.provider_settings.searxng.api_key,
        clear_searxng_api_key=request.provider_settings.searxng.clear_api_key,
        tavily_api_key=request.provider_settings.tavily.api_key,
        clear_tavily_api_key=request.provider_settings.tavily.clear_api_key,
        tavily_api_url=request.provider_settings.tavily.api_url,
    )
    await factory.reload()
    return await _build_search_config_response(factory)


@router.get("/providers")
async def list_providers(
    factory: SearchProviderFactory = Depends(get_search_factory),
):
    """List all available search engines and their status."""

    providers = await factory.get_available_providers()
    return [p.to_dict() for p in providers]


@router.get("/health")
async def search_health(
    factory: SearchProviderFactory = Depends(get_search_factory),
):
    """Check current search engine health status."""

    provider = await factory.get_provider()
    if provider is None:
        return {"status": "unavailable", "provider": None}
    return {
        "status": "ok",
        "provider": factory.get_current_provider(),
    }
