"""
LLM client factory — unified via LiteLLM.

LiteLLM routes to 100+ providers by model name prefix:
  "openai/gpt-4o"               → OpenAI
  "anthropic/claude-opus-4-5"   → Anthropic
  "ollama/qwen2.5:32b"          → Ollama (local)
  "azure/<deployment>"          → Azure OpenAI
  "groq/llama-3.3-70b-versatile"→ Groq
  "deepseek/deepseek-chat"      → DeepSeek
  "huggingface/<model>"         → HuggingFace TGI
  ... (100+ providers total)

Models WITHOUT a provider prefix are auto-inferred by LiteLLM.

Priority chain for api_key / api_base:
  1. Per-agent config.yaml fields   (highest priority)
  2. .env global fields             (fallback)
  3. LiteLLM / provider SDK default (no custom endpoint)
"""

from __future__ import annotations

import logging
from typing import Any

from langchain_core.language_models import BaseChatModel

from app.agents.llm_router import router as llm_router

logger = logging.getLogger(__name__)


def _resolve_api_key(override: dict[str, Any]) -> str | None:
    """
    Resolve API key from override config.
    
    Priority:
    1. Direct api_key in override (highest)
    2. Lookup by provider_id from database
    3. Use default provider from database
    """
    api_key = override.get("api_key")
    if api_key:
        return api_key
    
    provider_id = override.get("provider_id")
    
    from app.services.provider_service import provider_service
    
    if provider_id:
        providers = provider_service.list_configs_raw()
        for p in providers:
            if p.get("id") == provider_id:
                return p.get("api_key")
    
    default_config = provider_service.get_default_config()
    if default_config:
        providers = provider_service.list_configs_raw()
        for p in providers:
            if p.get("id") == default_config.id:
                return p.get("api_key")
    
    return None


def _resolve_provider_info(override: dict[str, Any]) -> tuple[str | None, str | None, str | None]:
    """
    Resolve provider_type and api_base_url from override config or database.
    
    Returns: (provider_type, api_base_url, api_key)
    """
    provider_type = override.get("provider_type")
    api_base_url = override.get("api_base_url")
    api_key = override.get("api_key")
    
    provider_id = override.get("provider_id")
    
    if provider_id:
        from app.services.provider_service import provider_service
        providers = provider_service.list_configs_raw()
        for p in providers:
            if p.get("id") == provider_id:
                if not provider_type:
                    provider_type = p.get("provider_type")
                if not api_base_url:
                    api_base_url = p.get("api_base_url")
                if not api_key:
                    api_key = p.get("api_key")
                break
    
    return provider_type, api_base_url, api_key


def create_llm(
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
    
    provider_type, api_base_url, api_key = _resolve_provider_info(override)

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

    return llm_router.get_client(
        provider_type=provider_type or "openai",
        model=model,
        api_key=api_key,
        api_base_url=api_base_url,
        **kwargs
    )


# ── Convenience getters ───────────────────────────────────────────

def get_debater_llm(streaming: bool = True, override: dict[str, Any] | None = None) -> BaseChatModel:
    return create_llm(streaming=streaming, override=override)


def get_judge_llm(streaming: bool = True, override: dict[str, Any] | None = None) -> BaseChatModel:
    return create_llm(streaming=streaming, override=override)


def get_fact_checker_llm(streaming: bool = True, override: dict[str, Any] | None = None) -> BaseChatModel:
    return create_llm(streaming=streaming, override=override)
