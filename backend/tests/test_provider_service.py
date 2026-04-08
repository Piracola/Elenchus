from __future__ import annotations

import pytest

from app.models.schemas import ModelConfigCreate, ModelConfigUpdate
from app.services.provider_service import ProviderService


@pytest.mark.asyncio
async def test_update_config_preserves_existing_api_key_when_omitted():
    service = ProviderService()

    created = await service.create_config(
        ModelConfigCreate(
            name="preserve-provider",
            provider_type="openai",
            api_key="sk-existing",
            api_base_url="https://example.com/v1",
            custom_parameters={},
            models=["gpt-4o"],
            is_default=False,
        )
    )

    updated = await service.update_config(
        created.id,
        ModelConfigUpdate(api_base_url="https://example.com/v2"),
    )
    raw_configs = await service.list_configs_raw()

    assert updated is not None
    assert updated.api_key_configured is True
    assert raw_configs[0]["api_key"] == "sk-existing"
    assert raw_configs[0]["api_base_url"] == "https://example.com/v2"


@pytest.mark.asyncio
async def test_update_config_rejects_duplicate_name():
    service = ProviderService()

    await service.create_config(
        ModelConfigCreate(
            name="provider-a",
            provider_type="openai",
            api_key="sk-a",
            api_base_url="https://example.com/a",
            custom_parameters={},
            models=["gpt-4o"],
            is_default=False,
        )
    )
    created = await service.create_config(
        ModelConfigCreate(
            name="provider-b",
            provider_type="openai",
            api_key="sk-b",
            api_base_url="https://example.com/b",
            custom_parameters={},
            models=["gpt-4o"],
            is_default=False,
        )
    )

    with pytest.raises(ValueError, match="already exists"):
        await service.update_config(created.id, ModelConfigUpdate(name="provider-a"))


@pytest.mark.asyncio
async def test_delete_default_config_promotes_new_default():
    service = ProviderService()

    first = await service.create_config(
        ModelConfigCreate(
            name="default-provider",
            provider_type="openai",
            api_key="sk-default",
            api_base_url="https://example.com/default",
            custom_parameters={},
            models=["gpt-4o"],
            is_default=True,
        )
    )
    second = await service.create_config(
        ModelConfigCreate(
            name="fallback-provider",
            provider_type="openai",
            api_key="sk-fallback",
            api_base_url="https://example.com/fallback",
            custom_parameters={},
            models=["gpt-4o"],
            is_default=False,
        )
    )

    deleted = await service.delete_config(first.id)
    remaining = await service.list_configs()

    assert deleted is True
    assert len(remaining) == 1
    assert remaining[0].id == second.id
    assert remaining[0].is_default is True
