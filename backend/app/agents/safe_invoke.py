"""
Safe model invocation helpers.

These helpers keep provider quirks localized so agent code only deals with
standard LangChain messages and plain text.
"""

from __future__ import annotations

import logging
import asyncio
from collections.abc import Awaitable, Callable, Sequence
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.tools import BaseTool

from app.agents.llm import ResolvedLLMConfig, create_llm_from_config, resolve_llm_config
from app.agents.model_response import (
    _coerce_openai_response_to_ai_message as _coerce_openai_response_to_ai_message_impl,
    extract_text_content as _extract_text_content,
    normalize_model_text as _normalize_model_text,
)
from app.agents.openai_transport import (
    invoke_openai_chat_raw,
    invoke_openai_chat_raw_streaming,
)

logger = logging.getLogger(__name__)

TokenCallback = Callable[[str], Awaitable[None]]
ProgressCallback = Callable[[float], Awaitable[None]]


async def invoke_chat_model(
    messages: Sequence[BaseMessage],
    *,
    override: dict[str, Any] | None = None,
    tools: Sequence[BaseTool] | None = None,
    on_token: TokenCallback | None = None,
    on_progress: ProgressCallback | None = None,
    timeout_seconds: float = 120.0,
    heartbeat_interval_seconds: float = 8.0,
    max_retries: int = 2,
) -> AIMessage | str:
    """
    Invoke a chat model and normalize known OpenAI-compatible response quirks.

    Some OpenAI-compatible providers return raw strings or malformed bodies that
    crash `langchain_openai` before the caller can handle them. When we detect
    that class of failure, retry with the raw OpenAI transport and coerce the
    result into an `AIMessage`.
    """
    last_exception = None
    config = None
    
    for attempt in range(max_retries + 1):
        try:
            config = await resolve_llm_config(override)
            llm = create_llm_from_config(config, streaming=on_token is not None)
            bound_tools = list(tools or [])

            if bound_tools:
                llm = llm.bind_tools(bound_tools)

            if on_token is not None:
                return await _run_with_heartbeat(
                    lambda: _invoke_chat_model_streaming(
                        llm=llm,
                        messages=list(messages),
                        on_token=on_token,
                    ),
                    on_progress=on_progress,
                    timeout_seconds=timeout_seconds,
                    heartbeat_interval_seconds=heartbeat_interval_seconds,
                )
            return await _run_with_heartbeat(
                lambda: llm.ainvoke(list(messages)),
                on_progress=on_progress,
                timeout_seconds=timeout_seconds,
                heartbeat_interval_seconds=heartbeat_interval_seconds,
            )
        except Exception as exc:
            last_exception = exc
            current_config = config if config is not None else await resolve_llm_config(override)
            if not _should_use_openai_raw_fallback(current_config, exc):
                if attempt < max_retries:
                    logger.warning(
                        "Model invocation failed (attempt %d/%d), retrying: %s",
                        attempt + 1,
                        max_retries + 1,
                        exc,
                    )
                    await asyncio.sleep(2 ** attempt)
                    continue
                else:
                    logger.error(
                        "Model invocation failed after %d attempts: %s",
                        max_retries + 1,
                        exc,
                    )
                    raise
            else:
                # 立即使用 OpenAI raw fallback，不重试
                logger.warning(
                    "Falling back to raw OpenAI transport for provider=%s model=%s base=%s: %s",
                    current_config.provider_type,
                    current_config.model,
                    current_config.api_base_url or "(default)",
                    exc,
                )
                return await _invoke_openai_raw(
                    messages=list(messages),
                    config=current_config,
                    tools=bound_tools,
                    on_token=on_token,
                    on_progress=on_progress,
                    timeout_seconds=timeout_seconds,
                    heartbeat_interval_seconds=heartbeat_interval_seconds,
                )


async def invoke_text_model(
    messages: Sequence[BaseMessage],
    *,
    override: dict[str, Any] | None = None,
    tools: Sequence[BaseTool] | None = None,
    on_token: TokenCallback | None = None,
    on_progress: ProgressCallback | None = None,
    timeout_seconds: float = 120.0,
    heartbeat_interval_seconds: float = 8.0,
    max_retries: int = 2,
) -> str:
    """Invoke a chat model and return plain text content with automatic retry."""
    last_exception = None
    
    for attempt in range(max_retries + 1):
        try:
            response = await invoke_chat_model(
                messages,
                override=override,
                tools=tools,
                on_token=on_token,
                on_progress=on_progress,
                timeout_seconds=timeout_seconds,
                heartbeat_interval_seconds=heartbeat_interval_seconds,
            )

            if hasattr(response, "content"):
                return extract_text_content(response.content)
            return extract_text_content(response)
        except Exception as exc:
            last_exception = exc
            if attempt < max_retries:
                logger.warning(
                    "Model invocation failed (attempt %d/%d), retrying: %s",
                    attempt + 1,
                    max_retries + 1,
                    exc,
                )
                await asyncio.sleep(2 ** attempt)
            else:
                logger.error(
                    "Model invocation failed after %d attempts: %s",
                    max_retries + 1,
                    exc,
                )
                raise


def extract_text_content(value: Any) -> str:
    """Compatibility wrapper for callers that still import from safe_invoke."""
    return _extract_text_content(value)


def normalize_model_text(text: str) -> str:
    """Compatibility wrapper for callers that still import from safe_invoke."""
    return _normalize_model_text(text)


def _coerce_openai_response_to_ai_message(raw_text: str) -> AIMessage:
    """Compatibility wrapper for callers and tests importing from safe_invoke."""
    return _coerce_openai_response_to_ai_message_impl(raw_text)


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
    on_token: TokenCallback | None = None,
    on_progress: ProgressCallback | None = None,
    timeout_seconds: float = 120.0,
    heartbeat_interval_seconds: float = 8.0,
) -> AIMessage:
    """Compatibility wrapper for the raw OpenAI-compatible transport adapter."""
    if on_token is not None:
        return await _run_with_heartbeat(
            lambda: invoke_openai_chat_raw_streaming(
                messages=messages,
                config=config,
                tools=tools,
                on_token=on_token,
            ),
            on_progress=on_progress,
            timeout_seconds=timeout_seconds,
            heartbeat_interval_seconds=heartbeat_interval_seconds,
        )
    return await _run_with_heartbeat(
        lambda: invoke_openai_chat_raw(
            messages=messages,
            config=config,
            tools=tools,
        ),
        on_progress=on_progress,
        timeout_seconds=timeout_seconds,
        heartbeat_interval_seconds=heartbeat_interval_seconds,
    )


async def _invoke_chat_model_streaming(
    *,
    llm: Any,
    messages: Sequence[BaseMessage],
    on_token: TokenCallback,
) -> AIMessage:
    aggregated_chunk: Any | None = None

    async for chunk in llm.astream(list(messages)):
        text_piece = _extract_stream_chunk_text(getattr(chunk, "content", ""))
        if text_piece:
            await on_token(text_piece)

        if aggregated_chunk is None:
            aggregated_chunk = chunk
            continue

        try:
            aggregated_chunk = aggregated_chunk + chunk
        except Exception:
            # Fall back to the latest chunk if a provider-specific chunk type
            # does not support additive merging cleanly.
            aggregated_chunk = chunk

    if aggregated_chunk is None:
        return AIMessage(content="")

    if isinstance(aggregated_chunk, AIMessage):
        # 处理 reasoning_content 字段（如 doubao-seed 模型的思维链）
        raw_content = getattr(aggregated_chunk, "content", "")
        reasoning = getattr(aggregated_chunk, "reasoning_content", None)
        
        if reasoning and len(str(reasoning)) > 0:
            reasoning_str = str(reasoning)
            content_str = str(raw_content) if raw_content else ""
            
            # 包装为前端期望的 <think> 标签格式
            if content_str:
                new_content = f"<think>{reasoning_str}</think>\n\n{content_str}"
            else:
                new_content = f"<think>{reasoning_str}</think>"
            
            aggregated_chunk.content = new_content
            
            logger.debug(
                "[Model Response] Extracted reasoning_content: reasoning_length=%d, content_length=%d, has_think_tags=%s",
                len(reasoning_str),
                len(content_str),
                "<think" in content_str.lower(),
            )
        elif raw_content and len(str(raw_content)) > 0:
            # 记录原始响应内容以便调试
            content_str = str(raw_content)
            logger.debug(
                "[Model Response] content_length=%d has_think_tags=%s content_preview=%s",
                len(content_str),
                "<think" in content_str.lower(),
                content_str[:200] if content_str else "",
            )
        
        return aggregated_chunk

    return AIMessage(
        content=extract_text_content(getattr(aggregated_chunk, "content", "")),
        tool_calls=list(getattr(aggregated_chunk, "tool_calls", []) or []),
    )


def _extract_stream_chunk_text(value: Any) -> str:
    """Preserve token whitespace for live streaming previews."""
    if isinstance(value, str):
        return value

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
        return "".join(parts)

    return extract_text_content(value)


async def _run_with_heartbeat(
    operation: Callable[[], Awaitable[Any]],
    *,
    on_progress: ProgressCallback | None,
    timeout_seconds: float,
    heartbeat_interval_seconds: float,
) -> Any:
    heartbeat_task: asyncio.Task | None = None

    async def heartbeat_loop() -> None:
        loop = asyncio.get_running_loop()
        started_at = loop.time()
        while True:
            await asyncio.sleep(heartbeat_interval_seconds)
            await on_progress(loop.time() - started_at)

    try:
        if on_progress is not None:
            heartbeat_task = asyncio.create_task(heartbeat_loop())
        async with asyncio.timeout(timeout_seconds):
            return await operation()
    except TimeoutError as exc:
        raise TimeoutError(
            f"Model invocation timed out after {int(timeout_seconds)} seconds."
        ) from exc
    finally:
        if heartbeat_task is not None:
            heartbeat_task.cancel()
            try:
                await heartbeat_task
            except asyncio.CancelledError:
                pass
