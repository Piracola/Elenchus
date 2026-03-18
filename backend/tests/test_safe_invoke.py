"""
Tests for safe model invocation fallbacks and response normalization.
"""

from __future__ import annotations

import json

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from app.agents import safe_invoke
from app.agents.llm import ResolvedLLMConfig


class BrokenOpenAILikeModel:
    """Fake model that reproduces the LangChain response-shape crash."""

    async def ainvoke(self, messages):
        raise AttributeError("'str' object has no attribute 'model_dump'")

    def bind_tools(self, tools):
        return self


@pytest.mark.asyncio
async def test_invoke_chat_model_falls_back_for_openai_shape_errors(monkeypatch):
    async def fake_resolve_llm_config(_override):
        return ResolvedLLMConfig(
            model="gpt-4o",
            provider_type="openai",
            api_key="test-key",
            api_base_url="https://example.invalid/v1",
            temperature=0.7,
            max_tokens=1500,
        )

    async def fake_invoke_openai_raw(*, messages, config, tools):
        assert isinstance(messages[0], HumanMessage)
        assert config.provider_type == "openai"
        assert tools == []
        return AIMessage(content="Recovered fallback response")

    monkeypatch.setattr(safe_invoke, "resolve_llm_config", fake_resolve_llm_config)
    monkeypatch.setattr(
        safe_invoke,
        "create_llm_from_config",
        lambda config, streaming=False: BrokenOpenAILikeModel(),
    )
    monkeypatch.setattr(safe_invoke, "_invoke_openai_raw", fake_invoke_openai_raw)

    response = await safe_invoke.invoke_chat_model([HumanMessage(content="hello")])

    assert isinstance(response, AIMessage)
    assert response.content == "Recovered fallback response"


def test_coerce_openai_response_to_ai_message_parses_tool_calls():
    raw_payload = {
        "choices": [
            {
                "message": {
                    "content": "",
                    "tool_calls": [
                        {
                            "id": "call_1",
                            "type": "function",
                            "function": {
                                "name": "web_search",
                                "arguments": json.dumps({"query": "ai safety"}),
                            },
                        }
                    ],
                }
            }
        ]
    }

    message = safe_invoke._coerce_openai_response_to_ai_message(
        json.dumps(raw_payload)
    )

    assert isinstance(message, AIMessage)
    assert message.tool_calls
    assert message.tool_calls[0]["name"] == "web_search"
    assert message.tool_calls[0]["args"] == {"query": "ai safety"}


def test_coerce_openai_response_to_ai_message_collapses_sse_stream():
    raw_sse = "\n\n".join(
        [
            'data: {"choices":[{"delta":{"role":"assistant","content":""},"index":0}]}',
            'data: {"choices":[{"delta":{"content":"Hello "},"index":0}]}',
            'data: {"choices":[{"delta":{"content":"world"},"index":0}]}',
            "data: [DONE]",
        ]
    )

    message = safe_invoke._coerce_openai_response_to_ai_message(raw_sse)

    assert isinstance(message, AIMessage)
    assert message.content == "Hello world"
    assert message.tool_calls == []


def test_coerce_openai_response_to_ai_message_rejects_html_document():
    html = "<!doctype html><html><head><title>New API</title></head><body></body></html>"

    with pytest.raises(ValueError, match="HTML"):
        safe_invoke._coerce_openai_response_to_ai_message(html)


def test_normalize_model_text_truncates_unbounded_payloads():
    giant = "x" * 60000

    normalized = safe_invoke.normalize_model_text(giant)

    assert len(normalized) < len(giant)
    assert normalized.endswith("characters.]")


def test_normalize_model_text_masks_html_documents():
    html = "<!doctype html><html lang='zh'><body>New API</body></html>"

    normalized = safe_invoke.normalize_model_text(html)

    assert "HTML" in normalized
    assert "<!doctype html>" not in normalized.lower()
