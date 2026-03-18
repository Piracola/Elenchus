"""
Safe model invocation helpers.

These helpers keep provider quirks localized so agent code only deals with
standard LangChain messages and plain text.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Sequence

from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.messages.tool import tool_call
from langchain_core.tools import BaseTool
from langchain_core.utils.function_calling import convert_to_openai_tool
from langchain_openai.chat_models.base import _convert_message_to_dict
from openai import AsyncOpenAI

from app.agents.llm import ResolvedLLMConfig, create_llm_from_config, resolve_llm_config

logger = logging.getLogger(__name__)
MAX_NORMALIZED_TEXT_LENGTH = 50000
_HTML_GUARD_MESSAGE = (
    "[Provider endpoint returned HTML instead of model output. "
    "Check API Base URL points to the OpenAI-compatible API route (usually ending with /v1).]"
)


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


def extract_text_content(value: Any) -> str:
    """Normalize the different content shapes returned by chat providers."""
    if isinstance(value, str):
        return value.strip()

    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            if isinstance(item, str):
                parts.append(item)
                continue

            if isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str):
                    parts.append(text)
                    continue

                nested_text = item.get("content")
                if isinstance(nested_text, str):
                    parts.append(nested_text)

        return "".join(parts).strip()

    if value is None:
        return ""

    if isinstance(value, (dict, tuple, set)):
        try:
            return json.dumps(value, ensure_ascii=False)
        except TypeError:
            return str(value).strip()

    return str(value).strip()


def normalize_model_text(text: str) -> str:
    """
    Collapse known provider transport artifacts into the final assistant text.

    This is mainly used as a safety net when malformed provider payloads have
    already escaped into persisted dialogue history.
    """
    normalized = extract_text_content(text)
    if not normalized:
        return normalized

    if _looks_like_html_document(normalized):
        return _HTML_GUARD_MESSAGE

    if _looks_like_sse_payload(normalized) or _looks_like_openai_chat_payload(normalized):
        message = _coerce_openai_response_to_ai_message(normalized)
        cleaned = extract_text_content(message.content)
        if cleaned:
            normalized = cleaned
        elif message.tool_calls:
            normalized = "[Tool call response omitted]"
        else:
            normalized = "[Malformed provider response omitted]"

    if len(normalized) > MAX_NORMALIZED_TEXT_LENGTH:
        overflow = len(normalized) - MAX_NORMALIZED_TEXT_LENGTH
        normalized = (
            f"{normalized[:MAX_NORMALIZED_TEXT_LENGTH]}\n\n"
            f"[Output truncated to protect the app. Omitted {overflow} characters.]"
        )

    return normalized


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


def _looks_like_sse_payload(text: str) -> bool:
    stripped = text.lstrip()
    return stripped.startswith("data:") and ('\n' in stripped or '\r' in stripped)


def _looks_like_openai_chat_payload(text: str) -> bool:
    stripped = text.lstrip()
    return stripped.startswith("{") and '"choices"' in stripped


def _looks_like_html_document(text: str) -> bool:
    stripped = text.lstrip().lower()
    if not stripped:
        return False

    if stripped.startswith("<!doctype html") or stripped.startswith("<html"):
        return True

    return "<html" in stripped and "</html>" in stripped and "<body" in stripped


def _provider_html_response_error(config: ResolvedLLMConfig) -> ValueError:
    base = config.api_base_url or "(provider default / env)"
    return ValueError(
        "Model invocation blocked: provider endpoint returned HTML instead of "
        f"OpenAI-compatible JSON (base_url={base}). "
        "Check API Base URL points to the API endpoint (usually ending with /v1), "
        "not the provider's web console URL."
    )


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


def _coerce_openai_response_to_ai_message(raw_text: str) -> AIMessage:
    """Parse raw text from an OpenAI-compatible endpoint into an AIMessage."""
    raw_text = raw_text.strip()
    if not raw_text:
        return AIMessage(content="")

    if _looks_like_html_document(raw_text):
        raise ValueError(
            "Provider endpoint returned HTML instead of OpenAI-compatible JSON."
        )

    if _looks_like_sse_payload(raw_text):
        return _coerce_openai_sse_to_ai_message(raw_text)

    try:
        payload = json.loads(raw_text)
    except json.JSONDecodeError:
        return AIMessage(content=raw_text)

    if isinstance(payload, str):
        return AIMessage(content=payload.strip())

    if not isinstance(payload, dict):
        return AIMessage(content=extract_text_content(payload))

    message_payload: dict[str, Any] = {}
    choices = payload.get("choices")
    if isinstance(choices, list) and choices:
        choice = choices[0] if isinstance(choices[0], dict) else {}
        message_payload = choice.get("message", {}) if isinstance(choice, dict) else {}

    if not message_payload and isinstance(payload.get("message"), dict):
        message_payload = payload["message"]

    if not isinstance(message_payload, dict):
        message_payload = {}

    content = extract_text_content(
        message_payload.get("content", payload.get("output_text", raw_text))
    )
    tool_calls = _parse_tool_calls(message_payload.get("tool_calls"))

    return AIMessage(content=content, tool_calls=tool_calls)


def _coerce_openai_sse_to_ai_message(raw_text: str) -> AIMessage:
    """Collapse SSE-style OpenAI chunks into one final AIMessage."""
    content_parts: list[str] = []
    tool_call_buffers: dict[str, dict[str, Any]] = {}

    for raw_line in raw_text.splitlines():
        line = raw_line.strip()
        if not line.startswith("data:"):
            continue

        chunk_text = line[5:].strip()
        if not chunk_text or chunk_text == "[DONE]":
            continue

        try:
            payload = json.loads(chunk_text)
        except json.JSONDecodeError:
            continue

        if not isinstance(payload, dict):
            continue

        choices = payload.get("choices")
        if not isinstance(choices, list):
            continue

        for choice in choices:
            if not isinstance(choice, dict):
                continue

            delta = choice.get("delta")
            if not isinstance(delta, dict):
                delta = choice.get("message")
            if not isinstance(delta, dict):
                delta = {}

            content_piece = delta.get("content")
            if content_piece is not None:
                if isinstance(content_piece, str):
                    text_piece = content_piece
                else:
                    text_piece = extract_text_content(content_piece)
                if text_piece:
                    content_parts.append(text_piece)

            _merge_tool_call_chunks(
                tool_call_buffers,
                delta.get("tool_calls", choice.get("tool_calls")),
            )

    tool_calls = []
    for chunk in tool_call_buffers.values():
        name = chunk.get("name")
        if not isinstance(name, str) or not name:
            continue
        tool_calls.append(
            tool_call(
                name=name,
                args=_parse_tool_args(chunk.get("arguments", "")),
                id=chunk.get("id"),
            )
        )

    content = "".join(content_parts).strip()
    if not content and not tool_calls:
        return AIMessage(content="[Malformed provider streaming response omitted]")

    return AIMessage(content=content, tool_calls=tool_calls)


def _merge_tool_call_chunks(
    buffers: dict[str, dict[str, Any]],
    tool_chunks: Any,
) -> None:
    """Accumulate partial tool-call chunks from SSE delta payloads."""
    if not isinstance(tool_chunks, list):
        return

    for item in tool_chunks:
        if not isinstance(item, dict):
            continue

        index = item.get("index")
        key = str(index if index is not None else item.get("id", len(buffers)))
        entry = buffers.setdefault(key, {"id": None, "name": "", "arguments": ""})

        if item.get("id"):
            entry["id"] = item["id"]

        fn = item.get("function", {})
        if not isinstance(fn, dict):
            fn = {}

        name = fn.get("name") or item.get("name")
        if isinstance(name, str) and name:
            entry["name"] = name

        arguments = fn.get("arguments", item.get("arguments"))
        if isinstance(arguments, str):
            entry["arguments"] += arguments


def _parse_tool_calls(value: Any) -> list[Any]:
    """Convert raw OpenAI tool calls into LangChain ToolCall objects."""
    if not isinstance(value, list):
        return []

    normalized = []
    for item in value:
        if not isinstance(item, dict):
            continue

        fn = item.get("function", {})
        if not isinstance(fn, dict):
            fn = {}

        name = fn.get("name") or item.get("name")
        if not isinstance(name, str) or not name:
            continue

        raw_args = fn.get("arguments", item.get("arguments", {}))
        args = _parse_tool_args(raw_args)
        normalized.append(tool_call(name=name, args=args, id=item.get("id")))

    return normalized


def _parse_tool_args(value: Any) -> dict[str, Any]:
    """Parse tool arguments from either JSON strings or dicts."""
    if isinstance(value, dict):
        return value

    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {"input": value}

        if isinstance(parsed, dict):
            return parsed
        return {"input": parsed}

    return {"input": value}
