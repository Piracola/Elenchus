"""
LLM client factory unified via the custom router.

The router resolves provider settings from per-agent overrides, persisted
provider configs, or the default provider, then instantiates the matching
LangChain chat client.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from langchain_core.language_models import BaseChatModel

from app.dependencies import get_agent_config_service, get_llm_router

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ResolvedLLMConfig:
    """Fully resolved runtime config for one model invocation."""

    model: str
    provider_type: str
    api_key: str
    api_base_url: str | None
    temperature: float
    max_tokens: int


async def _resolve_provider_info(
    override: dict[str, Any],
) -> tuple[str | None, str | None, str | None]:
    """
    Resolve provider_type and api_base_url from override config or database.

    Returns: (provider_type, api_base_url, api_key)
    """
    agent_config_service = get_agent_config_service()
    selection = await agent_config_service.resolve_provider_selection(override)
    return selection.provider_type, selection.api_base_url, selection.api_key


async def resolve_llm_config(
    override: dict[str, Any] | None = None,
) -> ResolvedLLMConfig:
    """Resolve provider, credentials, and generation settings for one call."""
    override = override or {}
    model = override.get("model", "gpt-4o")
    provider_type, api_base_url, api_key = await _resolve_provider_info(override)
    temperature = override.get("temperature", 0.7)
    max_tokens = override.get("max_tokens", 1500)

    if not api_key:
        raise ValueError(
            "Model invocation blocked: the selected agent is missing an API key. "
            "Open Settings and choose or create a default model provider first."
        )

    return ResolvedLLMConfig(
        model=model,
        provider_type=provider_type or "openai",
        api_key=api_key,
        api_base_url=api_base_url,
        temperature=temperature,
        max_tokens=max_tokens,
    )


def create_llm_from_config(
    config: ResolvedLLMConfig,
    *,
    streaming: bool = True,
) -> BaseChatModel:
    """Instantiate a LangChain chat model from a resolved config object."""
    kwargs: dict[str, Any] = {
        "temperature": config.temperature,
        "max_tokens": config.max_tokens,
        "streaming": streaming,
    }

    log_base = config.api_base_url or "(provider default / env)"
    logger.info(
        "[LLM Router] route=%s model=%s api_base=%s kwargs=%s",
        config.provider_type,
        config.model,
        log_base,
        {**kwargs, "api_key": "***"},
    )

    llm_router = get_llm_router()
    return llm_router.get_client(
        provider_type=config.provider_type,
        model=config.model,
        api_key=config.api_key,
        api_base_url=config.api_base_url,
        **kwargs,
    )


async def create_llm(
    *,
    streaming: bool = True,
    override: dict[str, Any] | None = None,
) -> BaseChatModel:
    """
    Build an LLM client from DB or JSON override payload.

    Raises:
        ValueError: If no usable API key can be resolved.
    """
    config = await resolve_llm_config(override)
    return create_llm_from_config(config, streaming=streaming)


async def get_llm(
    streaming: bool = True,
    override: dict[str, Any] | None = None,
) -> BaseChatModel:
    """Generic LLM getter for any agent role."""
    return await create_llm(streaming=streaming, override=override)


# Aliases for backward compatibility
get_debater_llm = get_llm
get_judge_llm = get_llm
get_fact_checker_llm = get_llm
