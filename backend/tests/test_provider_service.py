"""
Tests for local encryption key bootstrap behavior.
"""

from __future__ import annotations

import os
import shutil
from contextlib import contextmanager
from pathlib import Path

import pytest

from app.models.schemas import ModelConfigCreate, ModelConfigUpdate
from app.services import provider_service
from app.services.provider_service import ProviderService


@contextmanager
def _workspace_env_file():
    temp_dir = Path("backend/.pytest-local/provider-service")
    if temp_dir.exists():
        shutil.rmtree(temp_dir)
    temp_dir.mkdir(parents=True, exist_ok=True)
    try:
        yield temp_dir / ".env"
    finally:
        shutil.rmtree(temp_dir.parent, ignore_errors=True)


def test_ensure_local_encryption_key_generates_and_persists_when_missing(
    monkeypatch: pytest.MonkeyPatch,
):
    with _workspace_env_file() as env_file:
        monkeypatch.delenv("ELENCHUS_ENCRYPTION_KEY", raising=False)

        key = provider_service.ensure_local_encryption_key(env_file)

        assert provider_service._is_valid_fernet_key(key)
        assert os.environ["ELENCHUS_ENCRYPTION_KEY"] == key
        assert f"ELENCHUS_ENCRYPTION_KEY={key}" in env_file.read_text(encoding="utf-8")


def test_ensure_local_encryption_key_reuses_valid_file_value(
    monkeypatch: pytest.MonkeyPatch,
):
    with _workspace_env_file() as env_file:
        existing_key = provider_service.Fernet.generate_key().decode()
        env_file.write_text(
            f"ELENCHUS_ENCRYPTION_KEY={existing_key}\n",
            encoding="utf-8",
        )
        monkeypatch.delenv("ELENCHUS_ENCRYPTION_KEY", raising=False)

        key = provider_service.ensure_local_encryption_key(env_file)

        assert key == existing_key
        assert os.environ["ELENCHUS_ENCRYPTION_KEY"] == existing_key


def test_ensure_local_encryption_key_replaces_template_placeholder(
    monkeypatch: pytest.MonkeyPatch,
):
    with _workspace_env_file() as env_file:
        env_file.write_text(
            "ELENCHUS_ENCRYPTION_KEY=replace-with-a-generated-key\n",
            encoding="utf-8",
        )
        monkeypatch.delenv("ELENCHUS_ENCRYPTION_KEY", raising=False)

        key = provider_service.ensure_local_encryption_key(env_file)

        assert provider_service._is_valid_fernet_key(key)
        assert key != "replace-with-a-generated-key"
        assert f"ELENCHUS_ENCRYPTION_KEY={key}" in env_file.read_text(encoding="utf-8")


def test_ensure_local_encryption_key_rejects_invalid_custom_value(
    monkeypatch: pytest.MonkeyPatch,
):
    with _workspace_env_file() as env_file:
        monkeypatch.setenv("ELENCHUS_ENCRYPTION_KEY", "not-a-valid-key")

        with pytest.raises(ValueError, match="invalid"):
            provider_service.ensure_local_encryption_key(env_file)


@pytest.mark.asyncio
async def test_update_config_preserves_existing_api_key_when_omitted(db_session, monkeypatch):
    monkeypatch.setenv("ELENCHUS_ENCRYPTION_KEY", provider_service.Fernet.generate_key().decode())
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
async def test_update_config_rejects_duplicate_name(db_session, monkeypatch):
    monkeypatch.setenv("ELENCHUS_ENCRYPTION_KEY", provider_service.Fernet.generate_key().decode())
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



@pytest.mark.asyncio
async def test_delete_default_config_promotes_new_default(db_session, monkeypatch):
    monkeypatch.setenv("ELENCHUS_ENCRYPTION_KEY", provider_service.Fernet.generate_key().decode())
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


