from __future__ import annotations

from types import SimpleNamespace

import pytest
from langchain_core.messages import HumanMessage
from langchain_core.tools import tool

from app.agents.llm import ResolvedLLMConfig
from app.agents import openai_transport


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
    payload = openai_transport.build_openai_chat_payload(
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
    payload = openai_transport.build_openai_chat_payload(
        messages=[HumanMessage(content="hello")],
        config=_config(),
    )

    assert payload["reasoning_effort"] == "medium"
    assert payload["temperature"] == 0.7


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

    monkeypatch.setattr(openai_transport, "AsyncOpenAI", _FakeClient)

    with pytest.raises(ValueError, match="HTML"):
        await openai_transport.invoke_openai_chat_raw(
            messages=[HumanMessage(content="hello")],
            config=_config(),
        )
