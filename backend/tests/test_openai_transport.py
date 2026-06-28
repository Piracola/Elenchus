from __future__ import annotations

import json
from types import SimpleNamespace

import pytest
from langchain_core.messages import HumanMessage
from langchain_core.tools import tool

from app.llm.config import ResolvedLLMConfig
from app.llm import transport

from openai import AsyncOpenAI


@tool
def echo_tool(query: str) -> str:
    """Echo a query for testing."""
    return query


def _config() -> ResolvedLLMConfig:
    return ResolvedLLMConfig(
        model="gpt-4o",
        provider_type="openai",
        api_key="test-key",
        api_base_url="https://example.invalid/v1",
        custom_parameters={"reasoning_effort": "medium"},
        temperature=0.7,
        max_tokens=1500,
    )


def test_build_openai_chat_payload_includes_tools():
    payload = transport.build_openai_chat_payload(
        messages=[HumanMessage(content="hello")],
        config=_config(),
        tools=[echo_tool],
    )

    assert payload["model"] == "gpt-4o"
    assert payload["messages"]
    assert payload["messages"][0]["content"] == "hello"
    assert payload["tool_choice"] == "auto"
    assert payload["tools"][0]["function"]["name"] == "echo_tool"


def test_build_openai_chat_payload_includes_custom_parameters():
    payload = transport.build_openai_chat_payload(
        messages=[HumanMessage(content="hello")],
        config=_config(),
    )

    assert payload["reasoning_effort"] == "medium"
    assert payload["temperature"] == 0.7


def test_build_openai_chat_payload_routes_unknown_params_to_extra_body():
    config = ResolvedLLMConfig(
        model="qwen3",
        provider_type="openai",
        api_key="test-key",
        api_base_url="https://example.invalid/v1",
        custom_parameters={"enable_thinking": True, "top_p": 0.9},
        temperature=0.7,
        max_tokens=1500,
    )

    payload = transport.build_openai_chat_payload(
        messages=[HumanMessage(content="hello")],
        config=config,
    )

    assert "enable_thinking" not in payload
    assert payload["extra_body"] == {"enable_thinking": True}
    assert payload["top_p"] == 0.9


def test_build_openai_chat_payload_runtime_values_win_over_custom_parameters():
    config = ResolvedLLMConfig(
        model="qwen3",
        provider_type="openai",
        api_key="test-key",
        api_base_url="https://example.invalid/v1",
        custom_parameters={"max_tokens": 9999, "temperature": 2, "stream": True},
        temperature=0.7,
        max_tokens=1500,
    )

    payload = transport.build_openai_chat_payload(
        messages=[HumanMessage(content="hello")],
        config=config,
        stream=False,
    )

    assert payload["temperature"] == 0.7
    assert payload["max_tokens"] == 1500
    assert payload["stream"] is False


@pytest.mark.asyncio
async def test_invoke_openai_chat_raw_rejects_html_response(monkeypatch):
    class _FakeRawResponse:
        text = "<!doctype html><html><body>console</body></html>"

    class _FakeClient:
        def __init__(self, *args, **kwargs) -> None:
            self.chat = SimpleNamespace(
                completions=SimpleNamespace(
                    with_raw_response=SimpleNamespace(create=self.create)
                )
            )

        async def create(self, **kwargs):
            return _FakeRawResponse()

        def close(self) -> None:
            return None

    monkeypatch.setattr(transport, "AsyncOpenAI", _FakeClient)

    with pytest.raises(ValueError, match="HTML"):
        await transport.invoke_openai_chat_raw(
            messages=[HumanMessage(content="hello")],
            config=_config(),
        )


@pytest.mark.asyncio
async def test_invoke_openai_chat_raw_streaming_wraps_reasoning_tokens(monkeypatch):
    class _Delta:
        def __init__(self, *, reasoning_content=None, content=None) -> None:
            self.reasoning_content = reasoning_content
            self.content = content

    class _Choice:
        def __init__(self, delta: _Delta) -> None:
            self.delta = delta

    class _Chunk:
        def __init__(self, delta: dict[str, str]) -> None:
            self._delta = delta
            self.choices = [_Choice(_Delta(**delta))]

        def model_dump_json(self) -> str:
            return json.dumps({"choices": [{"delta": self._delta}]})

    class _FakeStream:
        def __init__(self) -> None:
            self._chunks = [
                _Chunk({"reasoning_content": "先想一下", "content": ""}),
                _Chunk({"content": "正式回答"}),
            ]

        def __aiter__(self):
            return self._iter()

        async def _iter(self):
            for chunk in self._chunks:
                yield chunk

    class _FakeClient:
        def __init__(self, *args, **kwargs) -> None:
            self.chat = SimpleNamespace(
                completions=SimpleNamespace(create=self.create)
            )

        async def create(self, **kwargs):
            return _FakeStream()

        def close(self) -> None:
            return None

    tokens: list[str] = []

    async def capture_token(token: str) -> None:
        tokens.append(token)

    monkeypatch.setattr(transport, "AsyncOpenAI", _FakeClient)

    result = await transport.invoke_openai_chat_raw_streaming(
        messages=[HumanMessage(content="hello")],
        config=_config(),
        on_token=capture_token,
    )

    assert tokens == ["<think>", "先想一下", "</think>\n\n", "正式回答"]
    assert result.content == "<think>先想一下</think>\n\n正式回答"
