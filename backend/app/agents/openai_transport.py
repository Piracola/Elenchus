"""
Raw OpenAI-compatible transport adapter.
"""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable, Sequence
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.tools import BaseTool
from langchain_core.utils.function_calling import convert_to_openai_tool
from langchain_openai.chat_models.base import _convert_message_to_dict
from openai import AsyncOpenAI

from app.agents.llm import ResolvedLLMConfig
from app.agents.model_response import (
    _coerce_openai_response_to_ai_message,
    _looks_like_html_document,
    _provider_html_response_error,
)

TokenCallback = Callable[[str], Awaitable[None]]


def build_openai_chat_payload(
    *,
    messages: Sequence[BaseMessage],
    config: ResolvedLLMConfig,
    tools: Sequence[BaseTool] | None = None,
    stream: bool = False,
) -> dict[str, Any]:
    """Build the OpenAI-compatible chat completions payload."""
    payload: dict[str, Any] = {
        "model": config.model,
        "messages": [_convert_message_to_dict(message) for message in messages],
        **config.custom_parameters,
        "temperature": config.temperature,
        "max_tokens": config.max_tokens,
        "stream": stream,
    }

    if tools:
        payload["tools"] = [convert_to_openai_tool(tool) for tool in tools]
        payload["tool_choice"] = "auto"

    return payload


async def invoke_openai_chat_raw(
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

    try:
        raw_response = await client.chat.completions.with_raw_response.create(
            **build_openai_chat_payload(
                messages=messages,
                config=config,
                tools=tools,
                stream=False,
            )
        )
        raw_text = raw_response.text
        if _looks_like_html_document(raw_text):
            raise _provider_html_response_error(config)
        return _coerce_openai_response_to_ai_message(raw_text)
    finally:
        client.close()


async def invoke_openai_chat_raw_streaming(
    *,
    messages: Sequence[BaseMessage],
    config: ResolvedLLMConfig,
    tools: Sequence[BaseTool] | None = None,
    on_token: TokenCallback | None = None,
) -> AIMessage:
    """Stream an OpenAI-compatible response and rebuild the final AIMessage."""
    client = AsyncOpenAI(
        api_key=config.api_key,
        base_url=config.api_base_url,
    )

    sse_lines: list[str] = []

    try:
        stream = await client.chat.completions.create(
            **build_openai_chat_payload(
                messages=messages,
                config=config,
                tools=tools,
                stream=True,
            )
        )
        async for chunk in stream:
            chunk_json = (
                chunk.model_dump_json()
                if hasattr(chunk, "model_dump_json")
                else json.dumps(chunk)
            )
            sse_lines.append(f"data: {chunk_json}")

            if on_token is not None:
                for choice in getattr(chunk, "choices", []) or []:
                    delta = getattr(choice, "delta", None)
                    content = getattr(delta, "content", None)
                    if content is None:
                        continue
                    if isinstance(content, str):
                        text_piece = content
                    else:
                        text_piece = "".join(
                            item.text
                            for item in content
                            if getattr(item, "text", None)
                        )
                    if text_piece:
                        await on_token(text_piece)

        sse_lines.append("data: [DONE]")
        raw_text = "\n\n".join(sse_lines)
        if _looks_like_html_document(raw_text):
            raise _provider_html_response_error(config)
        return _coerce_openai_response_to_ai_message(raw_text)
    finally:
        client.close()
