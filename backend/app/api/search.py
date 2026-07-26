"""
Search configuration API routes.

The payload is self-describing: every provider ships its own field list, so the
settings UI renders whatever the backend registry declares without knowing any
provider by name.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.config import (
    get_search_provider_settings_snapshot,
    get_settings,
    persist_search_settings,
)
from app.dependencies import get_search_factory
from app.search.factory import SearchProviderFactory
from app.search.registry import provider_classes

router = APIRouter(prefix="/search", tags=["search"])


class SearchProviderFieldResponse(BaseModel):
    """One configurable field, including its current value."""

    key: str
    label: str
    type: str = "text"
    placeholder: str = ""
    helper_text: str = ""
    secret: bool = False
    required: bool = False
    #: Always empty for secrets — their value never leaves the backend.
    value: str = ""
    #: For secrets: whether something is stored.
    configured: bool = False


class SearchProviderResponse(BaseModel):
    name: str
    label: str
    description: str = ""
    available: bool = False
    is_primary: bool = False
    #: False while required fields are still empty.
    configured: bool = False
    fields: list[SearchProviderFieldResponse] = Field(default_factory=list)


class SearchConfigResponse(BaseModel):
    """Response model for search configuration."""

    provider: str
    max_results_per_query: int
    providers: list[SearchProviderResponse]


class UpdateProviderRequest(BaseModel):
    """Request model for switching the active search provider."""

    provider: str


class UpdateSearchSettingsRequest(BaseModel):
    """Partial update of search settings.

    In `provider_settings`, an omitted field is left unchanged, and a field sent
    as `null` or `""` is cleared.
    """

    provider: str | None = None
    max_results_per_query: int | None = None
    provider_settings: dict[str, dict[str, str | None]] = Field(default_factory=dict)


async def _build_search_config_response(factory: SearchProviderFactory) -> SearchConfigResponse:
    status_by_name = {info.name: info for info in await factory.get_available_providers()}
    snapshot = get_search_provider_settings_snapshot()
    settings = get_settings()

    providers: list[SearchProviderResponse] = []
    for provider_class in provider_classes():
        stored = snapshot.get(provider_class.name, {})
        status = status_by_name.get(provider_class.name)
        providers.append(
            SearchProviderResponse(
                name=provider_class.name,
                label=provider_class.label or provider_class.name,
                description=provider_class.description,
                available=bool(status and status.available),
                is_primary=bool(status and status.is_primary),
                configured=bool(status and status.configured),
                fields=[
                    SearchProviderFieldResponse(
                        key=field.key,
                        label=field.label,
                        type=field.type,
                        placeholder=field.placeholder,
                        helper_text=field.helper_text,
                        secret=field.secret,
                        required=field.required,
                        value="" if field.secret else str(stored.get(field.key, "") or ""),
                        configured=bool(stored.get(f"{field.key}_configured"))
                        if field.secret
                        else bool(stored.get(field.key)),
                    )
                    for field in provider_class.config_fields
                ],
            )
        )

    return SearchConfigResponse(
        provider=factory.get_current_provider(),
        max_results_per_query=settings.search.max_results_per_query,
        providers=providers,
    )


async def build_search_health_payload(factory: SearchProviderFactory) -> dict[str, str | None]:
    provider = await factory.get_provider()
    if provider is None:
        return {
            "status": "unavailable",
            "provider": None,
        }
    # Report the provider actually serving traffic, which may differ from the
    # configured one when fallback kicked in.
    return {
        "status": "ok",
        "provider": provider.name or factory.get_current_provider(),
    }


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
    """Switch the active search engine."""

    success = factory.set_provider(request.provider)
    if not success:
        raise HTTPException(
            status_code=400,
            detail=f"搜索引擎 '{request.provider}' 不可用：名称无效或必填项尚未配置。",
        )
    return {"status": "ok", "provider": request.provider}


@router.put("/config", response_model=SearchConfigResponse)
async def update_search_settings(
    request: UpdateSearchSettingsRequest,
    factory: SearchProviderFactory = Depends(get_search_factory),
):
    """Update runtime-editable provider settings and rebuild the provider factory."""

    try:
        persist_search_settings(
            provider=request.provider,
            max_results_per_query=request.max_results_per_query,
            provider_settings=request.provider_settings,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    await factory.reload()
    return await _build_search_config_response(factory)


@router.get("/providers")
async def list_providers(
    factory: SearchProviderFactory = Depends(get_search_factory),
):
    """List all registered search engines and their status."""

    providers = await factory.get_available_providers()
    return [p.to_dict() for p in providers]


@router.get("/health")
async def search_health(
    factory: SearchProviderFactory = Depends(get_search_factory),
):
    """Check current search engine health status."""
    return await build_search_health_payload(factory)
