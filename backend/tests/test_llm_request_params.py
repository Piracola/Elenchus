from __future__ import annotations

import logging

from app.llm.request_params import (
    UNSUPPORTED_PROVIDER_PARAMS_METADATA_KEY,
    build_non_openai_langchain_kwargs,
    build_openai_langchain_kwargs,
    build_unsupported_provider_param_notice,
    split_non_openai_langchain_kwargs,
    split_openai_params,
)


def test_split_openai_params_routes_unknown_values_to_extra_body():
    known, extra_body = split_openai_params(
        {
            "temperature": 0.4,
            "reasoning_effort": "medium",
            "enable_thinking": True,
            "thinking_budget": 2048,
        }
    )

    assert known == {"temperature": 0.4, "reasoning_effort": "medium"}
    assert extra_body == {"enable_thinking": True, "thinking_budget": 2048}


def test_build_openai_langchain_kwargs_uses_extra_body():
    kwargs = build_openai_langchain_kwargs(
        custom_parameters={"enable_thinking": True, "top_p": 0.8},
        kwargs={"temperature": 0.5, "max_tokens": 1024, "streaming": True},
    )

    assert kwargs["temperature"] == 0.5
    assert kwargs["max_tokens"] == 1024
    assert kwargs["streaming"] is True
    assert kwargs["top_p"] == 0.8
    assert kwargs["extra_body"] == {"enable_thinking": True}
    assert "enable_thinking" not in kwargs


def test_build_non_openai_langchain_kwargs_warns_when_dropping_unsupported_params(
    caplog,
):
    with caplog.at_level(logging.WARNING, logger="app.llm.request_params"):
        kwargs = build_non_openai_langchain_kwargs(
            provider_type="anthropic",
            custom_parameters={"enable_thinking": True, "top_p": 0.8},
            kwargs={"temperature": 0.5, "max_tokens": 1024, "streaming": True},
        )

    assert kwargs == {
        "temperature": 0.5,
        "max_tokens": 1024,
        "streaming": True,
        "top_p": 0.8,
    }
    assert [
        (record.levelname, record.getMessage()) for record in caplog.records
    ] == [
        (
            "WARNING",
            "Dropping unsupported anthropic request parameters: enable_thinking",
        )
    ]


def test_build_gemini_langchain_kwargs_keeps_native_thinking_budget():
    kwargs = build_non_openai_langchain_kwargs(
        provider_type="gemini",
        custom_parameters={"enable_thinking": True, "thinking_budget": 2048},
        kwargs={"temperature": 0.5, "max_tokens": 1024},
    )

    assert kwargs == {
        "temperature": 0.5,
        "max_tokens": 1024,
        "thinking_budget": 2048,
    }


def test_build_non_openai_langchain_kwargs_keeps_supported_params_without_warning(
    caplog,
):
    with caplog.at_level(logging.WARNING, logger="app.llm.request_params"):
        kwargs = build_non_openai_langchain_kwargs(
            provider_type="gemini",
            custom_parameters={"response_modalities": ["TEXT"], "thinking_budget": 2048},
            kwargs={"temperature": 0.5, "max_tokens": 1024},
        )

    assert kwargs == {
        "temperature": 0.5,
        "max_tokens": 1024,
        "response_modalities": ["TEXT"],
        "thinking_budget": 2048,
    }
    assert not caplog.records


def test_build_non_openai_langchain_kwargs_warns_for_multiple_unsupported_params(
    caplog,
):
    with caplog.at_level(logging.WARNING, logger="app.llm.request_params"):
        kwargs = build_non_openai_langchain_kwargs(
            provider_type="gemini",
            custom_parameters={
                "enable_thinking": True,
                "response_modalities": ["TEXT"],
                "foo": "bar",
            },
            kwargs={"temperature": 0.5, "thinking": {"type": "enabled"}},
        )

    assert kwargs == {
        "temperature": 0.5,
        "response_modalities": ["TEXT"],
    }
    assert [
        (record.levelname, record.getMessage()) for record in caplog.records
    ] == [
        (
            "WARNING",
            "Dropping unsupported gemini request parameters: enable_thinking, foo, thinking",
        )
    ]


def test_split_non_openai_langchain_kwargs_returns_sorted_dropped_keys():
    kwargs, dropped_keys = split_non_openai_langchain_kwargs(
        provider_type="anthropic",
        custom_parameters={"foo": "bar", "enable_thinking": True, "top_p": 0.8},
        kwargs={"temperature": 0.5, "thinking": {"type": "enabled"}},
    )

    assert kwargs == {
        "temperature": 0.5,
        "top_p": 0.8,
    }
    assert dropped_keys == ["enable_thinking", "foo", "thinking"]


def test_build_unsupported_provider_param_notice_returns_structured_metadata():
    notice = build_unsupported_provider_param_notice(
        provider_type="gemini",
        dropped_keys=["enable_thinking", "foo"],
    )

    assert notice == {
        "provider": "gemini",
        "unsupported_parameters": ["enable_thinking", "foo"],
        "message": "gemini provider ignored unsupported request parameters: enable_thinking, foo",
    }
    assert UNSUPPORTED_PROVIDER_PARAMS_METADATA_KEY == "unsupported_request_parameters"
