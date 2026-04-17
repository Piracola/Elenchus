"""
Test script to diagnose why reasoning chain (思维链) is not displayed.

This simulates the backend invocation chain and checks whether <think> tags
are produced when enable_thinking=True.

Run from repo root:
    cd backend
    python -m pytest tests/test_reasoning_chain.py -v -s
Or directly:
    cd backend
    python tests/test_reasoning_chain.py
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

# We need to import from the app package
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.llm.config import ResolvedLLMConfig, resolve_llm_config, create_llm_from_config
from app.llm.invoke import (
    _normalize_reasoning_content,
    _invoke_chat_model_streaming,
    invoke_chat_model,
    _extract_stream_chunk_text,
)
from app.llm.transport import build_openai_chat_payload, invoke_openai_chat_raw_streaming
from app.llm.response import _coerce_openai_sse_to_ai_message


# ── Test 1: _normalize_reasoning_content wraps reasoning_content into <think> ──

def test_normalize_reasoning_content_wraps_think_tags():
    """If AIMessage has reasoning_content, it should be wrapped in <think>."""
    msg = AIMessage(content="Final answer here.")
    # Simulate a model that sets reasoning_content
    object.__setattr__(msg, "reasoning_content", "Let me think step by step...")

    result = _normalize_reasoning_content(msg)
    assert "<think>" in result.content
    assert "</think>" in result.content
    assert "Let me think step by step..." in result.content
    assert "Final answer here." in result.content
    print("[PASS] _normalize_reasoning_content wraps reasoning_content correctly")


def test_normalize_reasoning_content_no_op_without_reasoning():
    """If no reasoning_content, content should remain unchanged."""
    msg = AIMessage(content="Just a normal response.")
    result = _normalize_reasoning_content(msg)
    assert result.content == "Just a normal response."
    print("[PASS] _normalize_reasoning_content no-op when no reasoning_content")


# ── Test 2: build_openai_chat_payload includes enable_thinking ──

def test_payload_includes_custom_parameters():
    """custom_parameters (including enable_thinking) must be in the HTTP payload."""
    config = ResolvedLLMConfig(
        model="gpt-4o",
        provider_type="openai",
        api_key="sk-test",
        api_base_url="https://api.openai.com/v1",
        custom_parameters={"enable_thinking": True, "top_p": 0.9},
        temperature=0.7,
        max_tokens=4096,
    )
    payload = build_openai_chat_payload(
        messages=[HumanMessage(content="Hello")],
        config=config,
    )
    assert payload.get("enable_thinking") is True
    assert payload.get("top_p") == 0.9
    print("[PASS] build_openai_chat_payload includes custom_parameters")


# ── Test 3: Provider clients do NOT forward custom_parameters to LangChain constructors ──

@pytest.mark.asyncio
async def test_provider_clients_ignore_custom_parameters():
    """
    ROOT CAUSE #1:
    OpenAIProviderClient, AnthropicProviderClient, GeminiProviderClient
    all accept custom_parameters but do NOT pass them to the underlying
    ChatOpenAI / ChatAnthropic / ChatGoogleGenerativeAI constructors.

    This means enable_thinking never reaches the model, even though it's
    in the ResolvedLLMConfig.
    """
    from app.llm.providers.clients import (
        OpenAIProviderClient,
        AnthropicProviderClient,
        GeminiProviderClient,
    )

    # OpenAI
    with patch("app.llm.providers.clients.ChatOpenAI") as mock_openai:
        client = OpenAIProviderClient()
        client.create_client(
            model="gpt-4o",
            api_key="sk-test",
            api_base_url="https://api.openai.com/v1",
            custom_parameters={"enable_thinking": True},
            temperature=0.7,
            max_tokens=4096,
        )
        call_kwargs = mock_openai.call_args.kwargs
        assert "enable_thinking" in call_kwargs, (
            "OpenAIProviderClient should pass enable_thinking to ChatOpenAI! "
            f"Got kwargs: {call_kwargs}"
        )
        print(f"[PASS] OpenAIProviderClient kwargs include enable_thinking: {call_kwargs}")

    # Anthropic
    with patch("app.llm.providers.clients.ChatAnthropic") as mock_anthropic:
        client = AnthropicProviderClient()
        client.create_client(
            model="claude-3-sonnet",
            api_key="sk-test",
            custom_parameters={"enable_thinking": True},
        )
        call_kwargs = mock_anthropic.call_args.kwargs
        assert "enable_thinking" in call_kwargs, (
            f"AnthropicProviderClient should pass enable_thinking! Got: {call_kwargs}"
        )
        print(f"[PASS] AnthropicProviderClient kwargs include enable_thinking: {call_kwargs}")

    # Gemini
    with patch("app.llm.providers.clients.ChatGoogleGenerativeAI") as mock_gemini:
        client = GeminiProviderClient()
        client.create_client(
            model="gemini-pro",
            api_key="sk-test",
            custom_parameters={"enable_thinking": True},
        )
        call_kwargs = mock_gemini.call_args.kwargs
        assert "enable_thinking" in call_kwargs, (
            f"GeminiProviderClient should pass enable_thinking! Got: {call_kwargs}"
        )
        print(f"[PASS] GeminiProviderClient kwargs include enable_thinking: {call_kwargs}")

    print("[PASS] All provider clients now forward custom_parameters correctly")


# ── Test 4: Streaming token extraction ignores reasoning_content ──

@pytest.mark.asyncio
async def test_streaming_ignores_reasoning_content():
    """
    ROOT CAUSE #2:
    In _invoke_chat_model_streaming, only chunk.content is extracted and
    forwarded via on_token. If the model emits reasoning tokens in a separate
    field (e.g., chunk.reasoning_content), they are silently dropped.

    Also, invoke_openai_chat_raw_streaming only reads delta.content, not
    delta.reasoning_content.
    """
    tokens_received: list[str] = []

    async def mock_astream(messages):
        """Simulate a model that emits reasoning tokens then content tokens."""
        from langchain_core.messages import AIMessageChunk
        # Reasoning chunk
        yield AIMessageChunk(content="", reasoning_content="Let me analyze...")

        # Content chunks
        yield AIMessageChunk(content="The answer is")
        yield AIMessageChunk(content=" 42.")

    mock_llm = MagicMock()
    mock_llm.astream = mock_astream

    async def capture_token(t: str) -> None:
        tokens_received.append(t)

    result = await _invoke_chat_model_streaming(
        llm=mock_llm,
        messages=[HumanMessage(content="What is the meaning?")],
        on_token=capture_token,
    )

    # After fix: reasoning tokens should be preserved in the final result
    assert "<think>" in result.content, (
        f"Final result should contain <think> tags. Got: {repr(result.content)}"
    )
    assert "Let me analyze..." in result.content, (
        f"Final result should contain reasoning text. Got: {repr(result.content)}"
    )
    print(f"[PASS] Final result contains <think> tags: {repr(result.content[:80])}...")
    print("[PASS] Streaming now preserves reasoning_content in final AIMessage")


# ── Test 5: Raw fallback path does not normalize reasoning_content ──

def test_raw_fallback_missing_reasoning_normalization():
    """
    ROOT CAUSE #3:
    invoke_openai_chat_raw and invoke_openai_chat_raw_streaming do NOT call
    _normalize_reasoning_content(). Even if the raw response contains a
    reasoning_content field, it will not be converted to <think> tags.

    Additionally, _coerce_openai_sse_to_ai_message only reads delta.content,
    not delta.reasoning_content.
    """
    # Simulate SSE stream with reasoning_content in delta
    sse_lines = [
        'data: {"choices":[{"delta":{"reasoning_content":"Let me think...","content":""}}]}',
        'data: {"choices":[{"delta":{"content":"Hello"}}]}',
        'data: [DONE]',
    ]
    raw_text = "\n\n".join(sse_lines)

    msg = _coerce_openai_sse_to_ai_message(raw_text)
    print(f"[DETECTED] Coerced message content: {repr(msg.content)}")
    print(f"[DETECTED] Coerced message reasoning_content: {getattr(msg, 'reasoning_content', 'N/A')}")

    # After fix: reasoning should be wrapped in <think> tags
    assert "<think>" in msg.content, (
        f"Coerced message should contain <think> tags. Got: {repr(msg.content)}"
    )
    assert "Let me think..." in msg.content, (
        f"Coerced message should contain reasoning text. Got: {repr(msg.content)}"
    )
    print(f"[PASS] Coerced message contains <think> tags: {repr(msg.content)}")
    print("[PASS] Raw fallback path now preserves reasoning_content")


# ── Test 6: End-to-end simulation of debater flow ──

@pytest.mark.asyncio
async def test_debater_flow_no_think_tags_emitted():
    """
    Simulate what happens in debater.py when invoke_chat_model is called
    with enable_thinking=True and streaming.
    """
    from app.llm.invoke import invoke_chat_model

    tokens: list[str] = []

    async def capture_token(t: str) -> None:
        tokens.append(t)

    # We mock the LLM to simulate a model that supports reasoning
    mock_llm = MagicMock()

    async def mock_astream(messages):
        from langchain_core.messages import AIMessageChunk
        # Model thinks first
        yield AIMessageChunk(content="", reasoning_content="Analyzing the topic...")
        yield AIMessageChunk(content="", reasoning_content="Building arguments...")
        # Then speaks
        yield AIMessageChunk(content="我认为")
        yield AIMessageChunk(content="这个议题")
        yield AIMessageChunk(content="非常重要。")

    mock_llm.astream = mock_astream

    with patch("app.llm.invoke.create_llm_from_config", return_value=mock_llm):
        with patch("app.llm.invoke.resolve_llm_config") as mock_resolve:
            mock_resolve.return_value = ResolvedLLMConfig(
                model="gpt-4o",
                provider_type="openai",
                api_key="sk-test",
                api_base_url=None,
                custom_parameters={"enable_thinking": True},
                temperature=0.7,
                max_tokens=4096,
            )
            result = await invoke_chat_model(
                [SystemMessage(content="You are a debater"), HumanMessage(content="辩题：AI是否有意识")],
                override={"enable_thinking": True},
                on_token=capture_token,
            )

    print(f"[INFO] All tokens emitted: {tokens}")
    print(f"[INFO] Final result content: {repr(result.content if hasattr(result, 'content') else result)}")

    # After fix: final result should contain <think> tags with reasoning
    assert "<think>" in result.content, (
        f"Final result should contain <think> tags. Got: {repr(result.content)}"
    )
    assert "Analyzing the topic..." in result.content, (
        f"Final result should contain reasoning text. Got: {repr(result.content)}"
    )

    print("[PASS] End-to-end: <think> tags present in final result (FIX CONFIRMED)")


# ── Summary Report ──

def print_fix_summary():
    print("\n" + "=" * 70)
    print("FIX SUMMARY: Reasoning chain (思维链) display")
    print("=" * 70)
    print("""
1. [FIXED] backend/app/llm/providers/clients.py
   - OpenAIProviderClient, AnthropicProviderClient, GeminiProviderClient
     now merge custom_parameters into **kwargs before passing to LangChain
     model constructors. enable_thinking now reaches the model.

2. [FIXED] backend/app/llm/invoke.py
   - _invoke_chat_model_streaming() now extracts reasoning_content from each
     chunk, accumulates it, and attaches it to the final aggregated_chunk so
     _normalize_reasoning_content() can wrap it into <think> tags.

3. [FIXED] backend/app/llm/transport.py
   - invoke_openai_chat_raw_streaming() now reads delta.reasoning_content and
     emits those tokens via on_token, and includes them in the final SSE payload.

4. [FIXED] backend/app/llm/response.py
   - _coerce_openai_sse_to_ai_message() now accumulates reasoning_content from
     SSE deltas and wraps it via _normalize_reasoning_content_to_text().
   - _coerce_openai_response_to_ai_message() (non-streaming) now also checks
     message_payload.reasoning_content and wraps it.
   - Added _normalize_reasoning_content_to_text() helper for consistent wrapping.

RESULT: When enable_thinking=True, the backend now produces <think>...</think>
        tags in the response content, which the frontend correctly renders.
""")
    print("=" * 70)


if __name__ == "__main__":
    print("Running reasoning chain diagnosis tests...\n")

    test_normalize_reasoning_content_wraps_think_tags()
    test_normalize_reasoning_content_no_op_without_reasoning()
    test_payload_includes_custom_parameters()
    asyncio.run(test_provider_clients_ignore_custom_parameters())
    asyncio.run(test_streaming_ignores_reasoning_content())
    test_raw_fallback_missing_reasoning_normalization()
    asyncio.run(test_debater_flow_no_think_tags_emitted())

    print_fix_summary()
    print("\nAll tests completed.")
