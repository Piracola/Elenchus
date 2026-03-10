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

from langchain_litellm import ChatLiteLLM
from langchain_core.language_models import BaseChatModel

from app.config import AgentModelConfig, get_settings

logger = logging.getLogger(__name__)


def create_llm(
    agent_config: AgentModelConfig,
    *,
    streaming: bool = True,
    override: dict[str, Any] | None = None,
) -> BaseChatModel:
    """
    Build a ChatLiteLLM instance from an AgentModelConfig.

    LiteLLM automatically reads API keys and base URLs natively from os.environ.
    Per-agent config overrides (`api_key`, `api_base_url`) take precedence.
    Dynamic `override` dict (from frontend requests) takes highest precedence.
    """
    model = agent_config.model
    api_key = agent_config.api_key
    api_base_url = agent_config.api_base_url

    # Apply runtime dynamic overrides
    if override:
        model = override.get("model", model)
        # Empty string in override should reset key/base to use env vars
        api_key_override = override.get("api_key")
        if api_key_override is not None:
            api_key = api_key_override if api_key_override else None
        
        api_base_override = override.get("api_base_url")
        if api_base_override is not None:
            api_base_url = api_base_override if api_base_override else None

    # ── Build kwargs ─────────────────────────────────────────────
    kwargs: dict[str, Any] = {
        "model": model,
        "temperature": agent_config.temperature,
        "max_tokens": agent_config.max_tokens,
        "streaming": streaming,
    }

    if api_key:
        kwargs["api_key"] = api_key
    if api_base_url:
        kwargs["api_base"] = api_base_url

    log_base = api_base_url or "(provider default / env)"
    logger.info("[LLM] model=%s  api_base=%s", model, log_base)

    return ChatLiteLLM(**kwargs)


# ── Convenience getters ───────────────────────────────────────────

def get_debater_llm(streaming: bool = True, override: dict[str, Any] | None = None) -> BaseChatModel:
    return create_llm(get_settings().debater, streaming=streaming, override=override)


def get_judge_llm(streaming: bool = True, override: dict[str, Any] | None = None) -> BaseChatModel:
    return create_llm(get_settings().judge, streaming=streaming, override=override)


def get_fact_checker_llm(streaming: bool = True, override: dict[str, Any] | None = None) -> BaseChatModel:
    return create_llm(get_settings().fact_checker, streaming=streaming, override=override)
