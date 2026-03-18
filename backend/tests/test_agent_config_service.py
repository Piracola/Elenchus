"""Tests for centralized agent/provider config normalization."""

from __future__ import annotations

import pytest

from app.services.agent_config_service import AgentConfigService


class _FakeProviderService:
    def __init__(self, providers: list[dict[str, object]]) -> None:
        self._providers = providers

    async def list_configs_raw(self) -> list[dict[str, object]]:
        return list(self._providers)


def _providers() -> list[dict[str, object]]:
    return [
        {
            "id": "default-openai",
            "provider_type": "openai",
            "api_key": "openai-key",
            "api_base_url": "https://openai.example/v1",
            "models": ["gpt-4o"],
            "is_default": True,
        },
        {
            "id": "anthropic-team",
            "provider_type": "anthropic",
            "api_key": "anthropic-key",
            "api_base_url": "https://anthropic.example",
            "models": ["claude-3-7-sonnet"],
            "is_default": False,
        },
    ]


@pytest.mark.asyncio
async def test_build_session_agent_configs_preserves_provider_identity():
    service = AgentConfigService(provider_service=_FakeProviderService(_providers()))

    configs = await service.build_session_agent_configs(
        {
            "proposer": {
                "provider_id": "anthropic-team",
                "model": "claude-3-7-sonnet",
                "custom_name": "正方",
            }
        },
        ["proposer", "opposer"],
    )

    assert configs["proposer"]["provider_id"] == "anthropic-team"
    assert configs["proposer"]["provider_type"] == "anthropic"
    assert configs["proposer"]["api_base_url"] == "https://anthropic.example"
    assert configs["proposer"]["model"] == "claude-3-7-sonnet"
    assert "api_key" not in configs["proposer"]

    assert configs["opposer"]["provider_id"] == "default-openai"
    assert configs["judge"]["provider_id"] == "default-openai"
    assert configs["fact_checker"]["provider_id"] == "default-openai"


@pytest.mark.asyncio
async def test_resolve_provider_selection_uses_selected_provider_credentials():
    service = AgentConfigService(provider_service=_FakeProviderService(_providers()))

    selection = await service.resolve_provider_selection(
        {
            "provider_id": "anthropic-team",
            "provider_type": "anthropic",
        }
    )

    assert selection.provider_id == "anthropic-team"
    assert selection.provider_type == "anthropic"
    assert selection.api_base_url == "https://anthropic.example"
    assert selection.api_key == "anthropic-key"


@pytest.mark.asyncio
async def test_resolve_provider_selection_rejects_ambiguous_provider_hint():
    service = AgentConfigService(provider_service=_FakeProviderService(_providers()))

    with pytest.raises(ValueError, match="matching provider credential"):
        await service.resolve_provider_selection({"provider_type": "anthropic"})
