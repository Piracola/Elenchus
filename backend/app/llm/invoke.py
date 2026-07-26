"""Safe model invocation helpers."""

from __future__ import annotations

import asyncio
import logging
import re
from collections.abc import Awaitable, Callable, Sequence
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.tools import BaseTool

from app.llm.config import ResolvedLLMConfig, create_llm_from_config, resolve_llm_config
from app.llm.response import (
    _coerce_openai_response_to_ai_message as _coerce_openai_response_to_ai_message_impl,
    extract_text_content as _extract_text_content,
    normalize_model_text as _normalize_model_text,
)
from app.llm.request_params import (
    UNSUPPORTED_PROVIDER_PARAMS_METADATA_KEY,
    build_unsupported_provider_param_notice,
    split_non_openai_langchain_kwargs,
)
from app.llm.transport import (
    invoke_openai_chat_raw,
    invoke_openai_chat_raw_streaming,
)
from app.llm.failure_budget import (
    FailureBudgetExhausted,
    clamp_retry_delay,
    record_backoff,
    record_failure,
)
from app.llm.usage import UsageCallback, emit_usage

logger = logging.getLogger(__name__)

TokenCallback = Callable[[str], Awaitable[None]]
ProgressCallback = Callable[[float], Awaitable[None]]
_RETRY_AFTER_SECONDS_RE = re.compile(r"'retry_after':\s*(\d+)", re.IGNORECASE)


def _extract_retry_after_seconds(exc: Exception) -> int | None:
    """Best-effort parsing for provider-advised retry delay in seconds."""
    candidate_values: list[Any] = []

    response = getattr(exc, "response", None)
    if response is not None:
        headers = getattr(response, "headers", None)
        if headers is not None:
            header_value = None
            if hasattr(headers, "get"):
                header_value = headers.get("retry-after") or headers.get("Retry-After")
            if header_value is not None:
                candidate_values.append(header_value)

    for attr in ("retry_after", "retryAfter"):
        value = getattr(exc, attr, None)
        if value is not None:
            candidate_values.append(value)

    body = getattr(exc, "body", None)
    if isinstance(body, dict):
        for key in ("retry_after", "retryAfter"):
            value = body.get(key)
            if value is not None:
                candidate_values.append(value)

    candidate_values.append(str(exc))

    for value in candidate_values:
        if value is None:
            continue
        if isinstance(value, (int, float)):
            parsed = int(value)
            if parsed > 0:
                return parsed
            continue
        if isinstance(value, str):
            stripped = value.strip()
            if stripped.isdigit():
                parsed = int(stripped)
                if parsed > 0:
                    return parsed
            match = _RETRY_AFTER_SECONDS_RE.search(stripped)
            if match:
                parsed = int(match.group(1))
                if parsed > 0:
                    return parsed

    return None


async def _sleep_before_retry(exc: Exception, attempt: int) -> None:
    """Sleep using provider-advised retry_after when available, else exponential backoff.

    The provider-advised value is clamped: an unclamped `retry_after` sits
    outside the invocation timeout and could otherwise stall a node for hours.
    """
    retry_after_seconds = _extract_retry_after_seconds(exc)
    raw_delay = retry_after_seconds if retry_after_seconds is not None else 2 ** attempt
    delay_seconds = clamp_retry_delay(raw_delay)
    record_backoff(delay_seconds, exc)
    if retry_after_seconds is not None and delay_seconds < retry_after_seconds:
        logger.warning(
            "Clamped provider retry_after from %ss to %ss",
            retry_after_seconds,
            int(delay_seconds),
        )
    await asyncio.sleep(delay_seconds)


def _normalize_reasoning_content(response: AIMessage) -> AIMessage:
    """
    处理 response 中的 reasoning_content 字段，将其包装为前端期望的 <think> 标签格式。
    """
    raw_content = getattr(response, "content", "")
    reasoning = getattr(response, "reasoning_content", None)
    if not reasoning:
        additional_kwargs = getattr(response, "additional_kwargs", None)
        if isinstance(additional_kwargs, dict):
            reasoning = additional_kwargs.get("reasoning_content")

    if reasoning and len(str(reasoning)) > 0:
        reasoning_str = str(reasoning)
        content_str = str(raw_content) if raw_content else ""

        # 包装为前端期望的 <think> 标签格式
        if content_str:
            new_content = f"<think>{reasoning_str}</think>\n\n{content_str}"
        else:
            new_content = f"<think>{reasoning_str}</think>"

        response.content = new_content

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

    return response


def _attach_llm_request_metadata(
    response: AIMessage,
    config: ResolvedLLMConfig | None,
    llm_kwargs: dict[str, Any] | None,
) -> AIMessage:
    """Expose provider parameter warnings on successful model responses."""
    notice = None
    if config is not None and llm_kwargs is not None and config.provider_type != "openai":
        _, dropped_keys = split_non_openai_langchain_kwargs(
            provider_type=config.provider_type,
            custom_parameters=config.custom_parameters,
            kwargs=llm_kwargs,
        )
        notice = build_unsupported_provider_param_notice(
            provider_type=config.provider_type,
            dropped_keys=dropped_keys,
        )
    if isinstance(notice, dict) and notice:
        response.response_metadata.setdefault(
            UNSUPPORTED_PROVIDER_PARAMS_METADATA_KEY,
            notice,
        )
    return response


async def invoke_chat_model(
    messages: Sequence[BaseMessage],
    *,
    override: dict[str, Any] | None = None,
    tools: Sequence[BaseTool] | None = None,
    on_token: TokenCallback | None = None,
    on_progress: ProgressCallback | None = None,
    on_usage: UsageCallback | None = None,
    timeout_seconds: float = 120.0,
    heartbeat_interval_seconds: float = 1.0,
    max_retries: int = 2,
) -> AIMessage | str:
    """
    Invoke a chat model and normalize known OpenAI-compatible response quirks.

    Some OpenAI-compatible providers return raw strings or malformed bodies that
    crash `langchain_openai` before the caller can handle them. When we detect
    that class of failure, retry with the raw OpenAI transport and coerce the
    result into an `AIMessage`.
    """
    config = None
    bound_tools = list(tools or [])

    for attempt in range(max_retries + 1):
        used_raw_transport_this_attempt = False
        try:
            config = await resolve_llm_config(override)
            streaming = on_token is not None
            llm_kwargs = {
                "temperature": config.temperature,
                "max_tokens": config.max_tokens,
                "streaming": streaming,
            }

            if streaming and config.provider_type == "openai":
                used_raw_transport_this_attempt = True
                response = await _invoke_openai_raw(
                    messages=list(messages),
                    config=config,
                    tools=bound_tools,
                    on_token=on_token,
                    on_progress=on_progress,
                    timeout_seconds=timeout_seconds,
                    heartbeat_interval_seconds=heartbeat_interval_seconds,
                )
                await emit_usage(
                    on_usage,
                    response,
                    provider_type=config.provider_type,
                    model=config.model,
                )
                return response

            llm = create_llm_from_config(config, streaming=streaming)

            if bound_tools:
                llm = llm.bind_tools(bound_tools)

            if on_token is not None:
                response = await _run_with_heartbeat(
                    lambda: _invoke_chat_model_streaming(
                        llm=llm,
                        config=config,
                        llm_kwargs=llm_kwargs,
                        messages=list(messages),
                        on_token=on_token,
                    ),
                    on_progress=on_progress,
                    timeout_seconds=timeout_seconds,
                    heartbeat_interval_seconds=heartbeat_interval_seconds,
                )
                await emit_usage(
                    on_usage,
                    response,
                    provider_type=config.provider_type,
                    model=config.model,
                )
                return response
            response = await _run_with_heartbeat(
                lambda: llm.ainvoke(list(messages)),
                on_progress=on_progress,
                timeout_seconds=timeout_seconds,
                heartbeat_interval_seconds=heartbeat_interval_seconds,
            )
            await emit_usage(
                on_usage,
                response,
                provider_type=config.provider_type,
                model=config.model,
            )
            # 处理 reasoning_content（如 gemma-4 等模型的思维链）
            if isinstance(response, AIMessage):
                return _attach_llm_request_metadata(
                    _normalize_reasoning_content(response),
                    config,
                    llm_kwargs,
                )
            return response
        except FailureBudgetExhausted:
            raise
        except Exception as exc:
            record_failure(exc)
            current_config = config if config is not None else await resolve_llm_config(override)
            if used_raw_transport_this_attempt or not _should_use_openai_raw_fallback(current_config, exc):
                if attempt < max_retries:
                    logger.warning(
                        "Model invocation failed (attempt %d/%d), retrying: %s",
                        attempt + 1,
                        max_retries + 1,
                        exc,
                    )
                    await _sleep_before_retry(exc, attempt)
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
                fallback_response = await _invoke_openai_raw(
                    messages=list(messages),
                    config=current_config,
                    tools=bound_tools,
                    on_token=on_token,
                    on_progress=on_progress,
                    timeout_seconds=timeout_seconds,
                    heartbeat_interval_seconds=heartbeat_interval_seconds,
                )
                await emit_usage(
                    on_usage,
                    fallback_response,
                    provider_type=current_config.provider_type,
                    model=current_config.model,
                )
                return fallback_response


async def invoke_text_model(
    messages: Sequence[BaseMessage],
    *,
    override: dict[str, Any] | None = None,
    tools: Sequence[BaseTool] | None = None,
    on_token: TokenCallback | None = None,
    on_progress: ProgressCallback | None = None,
    on_usage: UsageCallback | None = None,
    timeout_seconds: float = 120.0,
    heartbeat_interval_seconds: float = 1.0,
    max_retries: int = 2,
) -> str:
    """Invoke a chat model and return plain text content with automatic retry."""
    for attempt in range(max_retries + 1):
        try:
            response = await invoke_chat_model(
                messages,
                override=override,
                tools=tools,
                on_token=on_token,
                on_progress=on_progress,
                on_usage=on_usage,
                timeout_seconds=timeout_seconds,
                heartbeat_interval_seconds=heartbeat_interval_seconds,
                max_retries=0,
            )

            if hasattr(response, "content"):
                return extract_text_content(response.content)
            return extract_text_content(response)
        except FailureBudgetExhausted:
            raise
        except Exception as exc:
            if attempt < max_retries:
                logger.warning(
                    "Model invocation failed (attempt %d/%d), retrying: %s",
                    attempt + 1,
                    max_retries + 1,
                    exc,
                )
                await _sleep_before_retry(exc, attempt)
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
    heartbeat_interval_seconds: float = 1.0,
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
    config: ResolvedLLMConfig | None = None,
    llm_kwargs: dict[str, Any] | None = None,
    messages: Sequence[BaseMessage],
    on_token: TokenCallback,
) -> AIMessage:
    aggregated_chunk: Any | None = None
    reasoning_parts: list[str] = []

    async for chunk in llm.astream(list(messages)):
        # Extract reasoning content if present (e.g. deep-thinking models)
        reasoning_piece = _extract_chunk_reasoning_text(chunk)
        if reasoning_piece:
            reasoning_parts.append(reasoning_piece)

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

    # LangChain chunk addition drops custom attributes like reasoning_content,
    # so we must restore the accumulated reasoning text before normalization.
    if reasoning_parts:
        object.__setattr__(
            aggregated_chunk, "reasoning_content", "".join(reasoning_parts)
        )

    if isinstance(aggregated_chunk, AIMessage):
        return _attach_llm_request_metadata(
            _normalize_reasoning_content(aggregated_chunk),
            config,
            llm_kwargs,
        )

    response = AIMessage(
        content=extract_text_content(getattr(aggregated_chunk, "content", "")),
        tool_calls=list(getattr(aggregated_chunk, "tool_calls", []) or []),
    )
    return _attach_llm_request_metadata(response, config, llm_kwargs)


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


def _extract_chunk_reasoning_text(chunk: Any) -> str:
    """Read reasoning text from both native attrs and provider kwargs."""
    direct = _extract_stream_chunk_text(getattr(chunk, "reasoning_content", ""))
    if direct:
        return direct

    additional_kwargs = getattr(chunk, "additional_kwargs", None)
    if isinstance(additional_kwargs, dict):
        for key in ("reasoning_content", "reasoning", "reasoning_text"):
            text = _extract_stream_chunk_text(additional_kwargs.get(key, ""))
            if text:
                return text

    response_metadata = getattr(chunk, "response_metadata", None)
    if isinstance(response_metadata, dict):
        for key in ("reasoning_content", "reasoning", "reasoning_text"):
            text = _extract_stream_chunk_text(response_metadata.get(key, ""))
            if text:
                return text

    return ""


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
