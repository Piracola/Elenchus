"""
Tests for safe model invocation fallbacks and response normalization.
"""

from __future__ import annotations

import pytest
from langchain_core.messages import AIMessage, AIMessageChunk

from app.llm.config import DEFAULT_MAX_TOKENS, ResolvedLLMConfig


async def fake_resolve_llm_config(override=None):
    return ResolvedLLMConfig(
        model="gpt-4o",
        provider_type="openai",
        api_key="test-key",
        api_base_url=None,
        custom_parameters={},
        temperature=0.7,
        max_tokens=1500,
    )


@pytest.mark.asyncio
async def test_invoke_chat_model_falls_back_for_openai_shape_errors():
    from app.llm.invoke import _should_use_openai_raw_fallback

    config = await fake_resolve_llm_config()
    exc = AttributeError("'str' object has no attribute 'model_dump'")
    assert _should_use_openai_raw_fallback(config, exc) is True


@pytest.mark.asyncio
async def test_invoke_chat_model_streaming_aggregates():
    from app.llm.invoke import _invoke_chat_model_streaming

    class StreamingModel:
        async def astream(self, messages):
            for text in ["Hello", " ", "world"]:
                yield AIMessageChunk(content=text)

        def bind_tools(self, tools):
            return self

    async def noop_on_token(token: str):
        pass

    model = StreamingModel()
    result = await _invoke_chat_model_streaming(
        llm=model,
        messages=[],
        on_token=noop_on_token,
    )

    assert result.content == "Hello world"


@pytest.mark.asyncio
async def test_extract_text_content_handles_nested_dicts():
    from app.llm.invoke import extract_text_content

    assert extract_text_content("hello") == "hello"
    assert extract_text_content([{"text": "a"}, "b"]) == "ab"
    assert extract_text_content(None) == ""
    assert extract_text_content({"key": "value"}) == '{"key": "value"}'


@pytest.mark.asyncio
async def test_normalize_model_text_truncates_long_output():
    from app.llm.response import MAX_NORMALIZED_TEXT_LENGTH, normalize_model_text

    long_text = "x" * (MAX_NORMALIZED_TEXT_LENGTH + 1000)
    result = normalize_model_text(long_text)
    assert "[Output truncated" in result
    assert "Omitted 1000 characters" in result


@pytest.mark.asyncio
async def test_normalize_model_text_detects_html():
    from app.llm.response import normalize_model_text

    result = normalize_model_text("<html><body>console</body></html>")
    assert "HTML" in result
