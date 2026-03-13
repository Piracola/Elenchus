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
    api_key = override.get("api_key")
    api_base_url = override.get("api_base_url")
    provider_type = override.get("provider_type", "openai")
    
    # Static defaults
    temperature = 0.7
    max_tokens = 1500

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
        provider_type=provider_type,
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
