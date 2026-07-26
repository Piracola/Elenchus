"""Tests for centralized agent/provider config normalization."""

from __future__ import annotations

import pytest

from app.runtime_config_store import normalize_runtime_config
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
            "custom_parameters": {"reasoning_effort": "medium"},
            "models": ["gpt-4o"],
            "is_default": True,
        },
        {
            "id": "anthropic-team",
            "provider_type": "anthropic",
            "api_key": "anthropic-key",
            "api_base_url": "https://anthropic.example",
            "custom_parameters": {"thinking": {"type": "enabled", "budget_tokens": 2048}},
            "models": ["claude-3-7-sonnet"],
            "is_default": False,
        },
    ]


def test_normalize_runtime_config_infers_context_mode_from_legacy_defaults():
    normalized = normalize_runtime_config(
        {
            "debate": {
                "context_runtime": {
                    "recent_turns_to_include": 2,
                    "evidence_items_per_agent": 4,
                    "exact_recent_entries_per_agent": 4,
                    "planning_entries_per_agent": 2,
                    "long_term_memory_entries_per_agent": 4,
                    "use_low_cost_context_model": True,
                    "low_cost_model_provider_id": "",
                    "low_cost_model_id": "",
                }
            }
        }
    )

    assert normalized["debate"]["context_runtime"]["context_injection_mode"] == "auto"
    assert normalized["debate"]["context_runtime"]["recent_turns_to_include"] == 2


def test_normalize_runtime_config_backfills_low_cost_model_id_from_provider():
    normalized = normalize_runtime_config(
        {
            "providers": [
                {
                    "id": "provider-1",
                    "name": "Provider A",
                    "provider_type": "openai",
                    "api_key": "test-key",
                    "models": ["deepseek-v4-flash", "deepseek-v4-pro"],
                    "is_default": True,
                }
            ],
            "debate": {
                "context_runtime": {
                    "use_low_cost_context_model": True,
                    "low_cost_model_provider_id": "provider-1",
                    "low_cost_model_id": "",
                }
            },
        }
    )

    assert normalized["debate"]["context_runtime"]["low_cost_model_provider_id"] == "provider-1"
    assert normalized["debate"]["context_runtime"]["low_cost_model_id"] == "deepseek-v4-flash"


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
    assert configs["group_discussion"]["provider_id"] == "default-openai"


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
    assert selection.default_model == "claude-3-7-sonnet"
    assert selection.custom_parameters == {
        "thinking": {"type": "enabled", "budget_tokens": 2048}
    }


@pytest.mark.asyncio
async def test_resolve_provider_selection_merges_override_custom_parameters():
    service = AgentConfigService(provider_service=_FakeProviderService(_providers()))

    selection = await service.resolve_provider_selection(
        {
            "provider_id": "default-openai",
            "custom_parameters": {
                "reasoning_effort": "high",
                "verbosity": "low",
            },
        }
    )

    assert selection.provider_id == "default-openai"
    assert selection.default_model == "gpt-4o"
    assert selection.custom_parameters == {
        "reasoning_effort": "high",
        "verbosity": "low",
    }


@pytest.mark.asyncio
async def test_resolve_provider_selection_rejects_ambiguous_provider_hint():
    service = AgentConfigService(provider_service=_FakeProviderService(_providers()))

    with pytest.raises(ValueError, match="matching provider credential"):
        await service.resolve_provider_selection({"provider_type": "anthropic"})
