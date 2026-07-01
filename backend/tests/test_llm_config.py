from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.llm import config as llm_config


@pytest.mark.asyncio
async def test_resolve_llm_config_raises_when_provider_has_no_model(monkeypatch):
    monkeypatch.setattr(
        llm_config,
        "get_settings",
        lambda: SimpleNamespace(debate=SimpleNamespace(default_max_tokens=64000)),
    )

    async def fake_resolve_provider_info(_override):
        return (
            "openai",
            "https://example.invalid/v1",
            "test-key",
            None,
            {},
        )

    monkeypatch.setattr(llm_config, "_resolve_provider_info", fake_resolve_provider_info)

    with pytest.raises(ValueError, match="selected provider has no resolved model"):
        await llm_config.resolve_llm_config({"provider_id": "provider-1"})
