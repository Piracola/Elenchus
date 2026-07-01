from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from app.agents import context_engine


@pytest.mark.asyncio
async def test_build_context_helper_override_includes_model_id(monkeypatch):
    monkeypatch.setattr(
        context_engine,
        "get_settings",
        lambda: SimpleNamespace(
            debate=SimpleNamespace(
                context_runtime=SimpleNamespace(
                    context_injection_mode="auto",
                    use_low_cost_context_model=True,
                    low_cost_model_provider_id="provider-1",
                    low_cost_model_id="gpt-4o-mini",
                )
            )
        ),
    )

    assert await context_engine.build_context_helper_override() == {
        "provider_id": "provider-1",
        "model": "gpt-4o-mini",
    }


@pytest.mark.asyncio
async def test_build_context_helper_override_returns_none_when_disabled(monkeypatch):
    monkeypatch.setattr(
        context_engine,
        "get_settings",
        lambda: SimpleNamespace(
            debate=SimpleNamespace(
                context_runtime=SimpleNamespace(
                    context_injection_mode="auto",
                    use_low_cost_context_model=False,
                    low_cost_model_provider_id=None,
                    low_cost_model_id=None,
                )
            )
        ),
    )

    assert await context_engine.build_context_helper_override() is None


@pytest.mark.asyncio
async def test_build_context_helper_override_still_uses_selected_model_when_legacy_flag_is_off(monkeypatch):
    monkeypatch.setattr(
        context_engine,
        "get_settings",
        lambda: SimpleNamespace(
            debate=SimpleNamespace(
                context_runtime=SimpleNamespace(
                    context_injection_mode="auto",
                    use_low_cost_context_model=False,
                    low_cost_model_provider_id="provider-2",
                    low_cost_model_id="deepseek-v4-flash",
                )
            )
        ),
    )

    assert await context_engine.build_context_helper_override() == {
        "provider_id": "provider-2",
        "model": "deepseek-v4-flash",
    }


@pytest.mark.asyncio
async def test_build_context_helper_override_fills_default_model_from_provider(monkeypatch):
    monkeypatch.setattr(
        context_engine,
        "get_settings",
        lambda: SimpleNamespace(
            debate=SimpleNamespace(
                context_runtime=SimpleNamespace(
                    context_injection_mode="auto",
                    use_low_cost_context_model=True,
                    low_cost_model_provider_id="provider-3",
                    low_cost_model_id=None,
                )
            )
        ),
    )

    fake_service = SimpleNamespace(
        resolve_provider_selection=AsyncMock(
            return_value=SimpleNamespace(default_model="deepseek-v4-flash")
        )
    )

    import app.dependencies as dependencies

    service = dependencies.get_agent_config_service()
    monkeypatch.setattr(
        service,
        "resolve_provider_selection",
        AsyncMock(return_value=SimpleNamespace(default_model="deepseek-v4-flash")),
    )

    assert await context_engine.build_context_helper_override() == {
        "provider_id": "provider-3",
        "model": "deepseek-v4-flash",
    }


def test_get_context_policy_uses_deep_mode_preset(monkeypatch):
    monkeypatch.setattr(
        context_engine,
        "get_settings",
        lambda: SimpleNamespace(
            debate=SimpleNamespace(
                context_runtime=SimpleNamespace(
                    context_injection_mode="deep",
                    recent_turns_to_include=2,
                    evidence_items_per_agent=4,
                    exact_recent_entries_per_agent=4,
                    planning_entries_per_agent=2,
                    long_term_memory_entries_per_agent=4,
                )
            )
        ),
    )

    policy = context_engine.get_context_policy({})

    assert policy.recent_turns_to_include == 4
    assert policy.evidence_items_per_agent == 8
    assert policy.exact_recent_entries_per_agent == 8
    assert policy.planning_entries_per_agent == 4
    assert policy.long_term_memory_entries_per_agent == 8


def test_get_context_policy_auto_expands_for_long_debate(monkeypatch):
    monkeypatch.setattr(
        context_engine,
        "get_settings",
        lambda: SimpleNamespace(
            debate=SimpleNamespace(
                context_runtime=SimpleNamespace(
                    context_injection_mode="auto",
                    recent_turns_to_include=2,
                    evidence_items_per_agent=4,
                    exact_recent_entries_per_agent=4,
                    planning_entries_per_agent=2,
                    long_term_memory_entries_per_agent=4,
                )
            )
        ),
    )

    policy = context_engine.get_context_policy(
        {
            "current_turn": 4,
            "max_turns": 10,
            "dialogue_history": [{"role": "proposer", "turn": index // 2} for index in range(12)],
            "shared_knowledge": [
                {"type": "fact", "source_turn": 1},
                {"type": "reference_claim", "source_turn": 2},
                {"type": "round_digest", "source_turn": 2},
                {"type": "memo", "source_role": "group_discussion"},
            ],
        }
    )

    assert policy.recent_turns_to_include == 3
    assert policy.evidence_items_per_agent == 6
    assert policy.exact_recent_entries_per_agent == 6
    assert policy.planning_entries_per_agent == 3
    assert policy.long_term_memory_entries_per_agent == 6
