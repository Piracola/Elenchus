"""Provider-specific request parameter normalization."""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

UNSUPPORTED_PROVIDER_PARAMS_METADATA_KEY = "unsupported_request_parameters"

OPENAI_CHAT_KNOWN_PARAMS = {
    "audio",
    "frequency_penalty",
    "function_call",
    "functions",
    "logit_bias",
    "logprobs",
    "max_completion_tokens",
    "max_tokens",
    "metadata",
    "modalities",
    "n",
    "parallel_tool_calls",
    "prediction",
    "presence_penalty",
    "prompt_cache_key",
    "reasoning_effort",
    "response_format",
    "safety_identifier",
    "seed",
    "service_tier",
    "stop",
    "store",
    "stream",
    "stream_options",
    "temperature",
    "tool_choice",
    "tools",
    "top_logprobs",
    "top_p",
    "user",
    "verbosity",
    "web_search_options",
    "timeout",
}

OPENAI_LANGCHAIN_KNOWN_PARAMS = {
    "temperature",
    "max_tokens",
    "streaming",
    "top_p",
    "timeout",
    "max_retries",
    "model_name",
    "max_completion_tokens",
    "reasoning_effort",
    "presence_penalty",
    "frequency_penalty",
    "seed",
    "logprobs",
    "top_logprobs",
    "logit_bias",
    "stop",
    "stop_sequences",
    "response_format",
    "stream_options",
    "verbosity",
}

ANTHROPIC_LANGCHAIN_KNOWN_PARAMS = {
    "temperature",
    "max_tokens",
    "streaming",
    "top_p",
    "top_k",
    "timeout",
    "max_retries",
    "model_name",
    "stop",
    "stop_sequences",
    "default_headers",
}

GEMINI_LANGCHAIN_KNOWN_PARAMS = {
    "temperature",
    "max_tokens",
    "streaming",
    "top_p",
    "top_k",
    "timeout",
    "max_retries",
    "model_name",
    "thinking_budget",
    "include_thoughts",
    "response_modalities",
    "safety_settings",
    "transport",
    "convert_system_message_to_human",
}

GENERIC_THINKING_FLAGS = {
    "enable_thinking",
    "thinking",
}


def _merge_request_params(
    custom_parameters: dict[str, Any] | None,
    kwargs: dict[str, Any],
) -> dict[str, Any]:
    return {**(custom_parameters or {}), **kwargs}


def _get_non_openai_known_params(provider_type: str) -> set[str]:
    return (
        GEMINI_LANGCHAIN_KNOWN_PARAMS
        if provider_type == "gemini"
        else ANTHROPIC_LANGCHAIN_KNOWN_PARAMS
    )


def split_openai_params(
    params: dict[str, Any] | None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Split OpenAI SDK kwargs from provider-specific extra request body."""
    known: dict[str, Any] = {}
    extra_body: dict[str, Any] = {}

    for key, value in (params or {}).items():
        if value is None:
            continue
        if key in OPENAI_CHAT_KNOWN_PARAMS:
            known[key] = value
        else:
            extra_body[key] = value

    return known, extra_body


def build_openai_langchain_kwargs(
    *,
    custom_parameters: dict[str, Any] | None,
    kwargs: dict[str, Any],
) -> dict[str, Any]:
    """Build ChatOpenAI kwargs without leaking custom fields to SDK top-level."""
    merged = _merge_request_params(custom_parameters, kwargs)
    result: dict[str, Any] = {
        key: value
        for key, value in merged.items()
        if key in OPENAI_LANGCHAIN_KNOWN_PARAMS and value is not None
    }
    extra_body = {
        key: value
        for key, value in merged.items()
        if key not in OPENAI_LANGCHAIN_KNOWN_PARAMS and value is not None
    }
    if extra_body:
        result["extra_body"] = extra_body
    return result


def split_non_openai_langchain_kwargs(
    *,
    provider_type: str,
    custom_parameters: dict[str, Any] | None,
    kwargs: dict[str, Any],
) -> tuple[dict[str, Any], list[str]]:
    """Split supported kwargs from unsupported ones for non-OpenAI providers."""
    known_keys = _get_non_openai_known_params(provider_type)
    merged = _merge_request_params(custom_parameters, kwargs)
    result: dict[str, Any] = {}
    dropped_keys: list[str] = []

    for key, value in merged.items():
        if value is None:
            continue
        if key in known_keys and key not in GENERIC_THINKING_FLAGS:
            result[key] = value
            continue
        dropped_keys.append(key)

    return result, sorted(dropped_keys)


def build_unsupported_provider_param_notice(
    *,
    provider_type: str,
    dropped_keys: list[str],
) -> dict[str, Any] | None:
    """Build structured metadata for unsupported provider request params."""
    if not dropped_keys:
        return None

    return {
        "provider": provider_type,
        "unsupported_parameters": list(dropped_keys),
        "message": (
            f"{provider_type} provider ignored unsupported request parameters: "
            f"{', '.join(dropped_keys)}"
        ),
    }


def log_unsupported_provider_params(
    *,
    provider_type: str,
    dropped_keys: list[str],
) -> None:
    """Emit the standard warning for unsupported non-OpenAI params."""
    if dropped_keys:
        logger.warning(
            "Dropping unsupported %s request parameters: %s",
            provider_type,
            ", ".join(dropped_keys),
        )


def build_non_openai_langchain_kwargs(
    *,
    provider_type: str,
    custom_parameters: dict[str, Any] | None,
    kwargs: dict[str, Any],
) -> dict[str, Any]:
    """Build kwargs for non-OpenAI providers and warn on dropped extras."""
    result, dropped_keys = split_non_openai_langchain_kwargs(
        provider_type=provider_type,
        custom_parameters=custom_parameters,
        kwargs=kwargs,
    )
    log_unsupported_provider_params(
        provider_type=provider_type,
        dropped_keys=dropped_keys,
    )

    return result
