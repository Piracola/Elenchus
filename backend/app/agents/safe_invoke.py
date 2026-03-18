"""
Safe model invocation helpers.

These helpers keep provider quirks localized so agent code only deals with
standard LangChain messages and plain text.
"""

from __future__ import annotations

import logging
from typing import Any, Sequence

from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.tools import BaseTool
from langchain_core.utils.function_calling import convert_to_openai_tool
from langchain_openai.chat_models.base import _convert_message_to_dict
from openai import AsyncOpenAI

from app.agents.llm import ResolvedLLMConfig, create_llm_from_config, resolve_llm_config
from app.agents.model_response import (
    _coerce_openai_response_to_ai_message,
    _looks_like_html_document,
    _provider_html_response_error,
    extract_text_content,
    normalize_model_text as _normalize_model_text,
)

logger = logging.getLogger(__name__)


async def invoke_chat_model(
    messages: Sequence[BaseMessage],
    *,
    override: dict[str, Any] | None = None,
    tools: Sequence[BaseTool] | None = None,
) -> AIMessage | str:
    """
    Invoke a chat model and normalize known OpenAI-compatible response quirks.

    Some OpenAI-compatible providers return raw strings or malformed bodies that
    crash `langchain_openai` before the caller can handle them. When we detect
    that class of failure, retry with the raw OpenAI transport and coerce the
    result into an `AIMessage`.
    """
    config = await resolve_llm_config(override)
    llm = create_llm_from_config(config, streaming=False)
    bound_tools = list(tools or [])

    if bound_tools:
        llm = llm.bind_tools(bound_tools)

    try:
        return await llm.ainvoke(list(messages))
    except Exception as exc:
        if not _should_use_openai_raw_fallback(config, exc):
            raise

        logger.warning(
            "Falling back to raw OpenAI transport for provider=%s model=%s base=%s: %s",
            config.provider_type,
            config.model,
            config.api_base_url or "(default)",
            exc,
        )
        return await _invoke_openai_raw(
            messages=list(messages),
            config=config,
            tools=bound_tools,
        )


async def invoke_text_model(
    messages: Sequence[BaseMessage],
    *,
    override: dict[str, Any] | None = None,
    tools: Sequence[BaseTool] | None = None,
) -> str:
    """Invoke a chat model and return plain text content."""
    response = await invoke_chat_model(messages, override=override, tools=tools)

    if hasattr(response, "content"):
        return extract_text_content(response.content)
    return extract_text_content(response)


def normalize_model_text(text: str) -> str:
    """Compatibility wrapper for callers that still import from safe_invoke."""
    return _normalize_model_text(text)


def _should_use_openai_raw_fallback(
    config: ResolvedLLMConfig,
    exc: Exception,
) -> bool:
    """Detect response-shape failures that come from OpenAI-compatible providers."""
    if config.provider_type != "openai":
        return False

    if not isinstance(exc, (AttributeError, TypeError, KeyError, ValueError)):
        return False

    text = str(exc)
    markers = (
        "model_dump",
        "choices",
        "tool_calls",
        "ChatCompletion",
        "response format",
    )
    return any(marker in text for marker in markers)


async def _invoke_openai_raw(
    *,
    messages: Sequence[BaseMessage],
    config: ResolvedLLMConfig,
    tools: Sequence[BaseTool] | None = None,
) -> AIMessage:
    """Call the raw OpenAI-compatible HTTP transport and coerce its response."""
    client = AsyncOpenAI(
        api_key=config.api_key,
        base_url=config.api_base_url,
    )

    payload: dict[str, Any] = {
        "model": config.model,
        "messages": [_convert_message_to_dict(message) for message in messages],
        "temperature": config.temperature,
        "max_tokens": config.max_tokens,
        "stream": False,
    }

    if tools:
        payload["tools"] = [convert_to_openai_tool(tool) for tool in tools]
        payload["tool_choice"] = "auto"

    try:
        raw_response = await client.chat.completions.with_raw_response.create(**payload)
        raw_text = raw_response.text
        if _looks_like_html_document(raw_text):
            raise _provider_html_response_error(config)
        return _coerce_openai_response_to_ai_message(raw_text)
    finally:
        client.close()
