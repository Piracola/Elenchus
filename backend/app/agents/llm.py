"""
LLM client factory — unified via custom LLMRouter.

The LLMRouter routes requests to the appropriate LangChain provider client:
  - "openai"     → ChatOpenAI (also supports OpenAI-compatible APIs via base_url)
  - "anthropic"  → ChatAnthropic
  - "gemini"     → ChatGoogleGenerativeAI

OpenAI-compatible providers (DeepSeek, Groq, Ollama, etc.) can be used by:
  1. Setting provider_type to "openai"
  2. Setting api_base_url to the provider's API endpoint

Priority chain for api_key / api_base:
  1. Per-agent config override (highest priority)
  2. provider_id lookup from provider_service
  3. Default provider configuration
"""

from __future__ import annotations

import logging
from typing import Any

from langchain_core.language_models import BaseChatModel

from app.dependencies import get_llm_router, get_provider_service

logger = logging.getLogger(__name__)


async def _resolve_provider_info(override: dict[str, Any]) -> tuple[str | None, str | None, str | None]:
    """
    Resolve provider_type and api_base_url from override config or database.
    
    Returns: (provider_type, api_base_url, api_key)
    """
    provider_type = override.get("provider_type")
    api_base_url = override.get("api_base_url")
    api_key = override.get("api_key")
    
    provider_id = override.get("provider_id")
    
    provider_service = get_provider_service()
    
    if provider_id:
        providers = await provider_service.list_configs_raw()
        for p in providers:
            if p.get("id") == provider_id:
                if not provider_type:
                    provider_type = p.get("provider_type")
                if not api_base_url:
                    api_base_url = p.get("api_base_url")
                if not api_key:
                    api_key = p.get("api_key")
                break
    elif not api_key:
        default_config = await provider_service.get_default_config()
        if default_config:
            providers = await provider_service.list_configs_raw()
            for p in providers:
                if p.get("id") == default_config.id:
                    provider_type = provider_type or p.get("provider_type")
                    api_base_url = api_base_url or p.get("api_base_url")
                    api_key = p.get("api_key")
                    break
    
    return provider_type, api_base_url, api_key


async def create_llm(
    *,
    streaming: bool = True,
    override: dict[str, Any] | None = None,
) -> BaseChatModel:
    """
    Build an LLM client pure from DB/JSON override payload.
    If api_key is missing, throw an exception guiding the user to configure the backend.
    """
    override = override or {}
    model = override.get("model", "gpt-4o")
    
    provider_type, api_base_url, api_key = await _resolve_provider_info(override)

    temperature = override.get("temperature", 0.7)
    max_tokens = override.get("max_tokens", 1500)

    if not api_key:
        raise ValueError("模型调用拦截：当前辩手/裁判缺少必需的 API Key 金钥。请点击左下角【设置】选择或创建一个默认的模型服务商配置！")

    kwargs: dict[str, Any] = {
        "temperature": temperature,
        "max_tokens": max_tokens,
        "streaming": streaming,
    }

    log_base = api_base_url or "(provider default / env)"
    logger.info("[LLM Router] route=%s model=%s api_base=%s kwargs=%s", provider_type, model, log_base, {**kwargs, "api_key": "***"})

    llm_router = get_llm_router()
    return llm_router.get_client(
        provider_type=provider_type or "openai",
        model=model,
        api_key=api_key,
        api_base_url=api_base_url,
        **kwargs
    )


# ── Convenience getters ───────────────────────────────────────────

async def get_llm(streaming: bool = True, override: dict[str, Any] | None = None) -> BaseChatModel:
    """Generic LLM getter for any agent role."""
    return await create_llm(streaming=streaming, override=override)


# Aliases for backward compatibility
get_debater_llm = get_llm
get_judge_llm = get_llm
get_fact_checker_llm = get_llm
