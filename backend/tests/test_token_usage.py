from __future__ import annotations

import pytest
from langchain_core.messages import AIMessage

from app.llm.response import (
    _coerce_openai_response_to_ai_message,
    _coerce_openai_sse_to_ai_message,
)
from app.llm.usage import UsageRecord, emit_usage, extract_usage_from_message
from app.services.run_projector.events import _accumulate_token_usage


def test_extract_usage_from_langchain_usage_metadata():
    message = AIMessage(
        content="hi",
        usage_metadata={"input_tokens": 10, "output_tokens": 5, "total_tokens": 15},
    )
    assert extract_usage_from_message(message) == {
        "input_tokens": 10,
        "output_tokens": 5,
        "total_tokens": 15,
    }


def test_extract_usage_from_openai_response_metadata():
    message = AIMessage(content="hi")
    message.response_metadata["token_usage"] = {
        "prompt_tokens": 7,
        "completion_tokens": 3,
        "total_tokens": 10,
    }
    assert extract_usage_from_message(message) == {
        "input_tokens": 7,
        "output_tokens": 3,
        "total_tokens": 10,
    }


def test_raw_json_coerce_attaches_usage():
    raw = (
        '{"choices": [{"message": {"content": "ok"}}], '
        '"usage": {"prompt_tokens": 12, "completion_tokens": 4, "total_tokens": 16}}'
    )
    message = _coerce_openai_response_to_ai_message(raw)
    assert message.usage_metadata == {
        "input_tokens": 12,
        "output_tokens": 4,
        "total_tokens": 16,
    }


def test_sse_coerce_reads_usage_frame_with_empty_choices():
    raw = "\n\n".join(
        [
            'data: {"choices": [{"delta": {"content": "hello"}}]}',
            'data: {"choices": [], "usage": {"prompt_tokens": 20, "completion_tokens": 8, "total_tokens": 28}}',
            "data: [DONE]",
        ]
    )
    message = _coerce_openai_sse_to_ai_message(raw)
    assert message.content == "hello"
    assert message.usage_metadata == {
        "input_tokens": 20,
        "output_tokens": 8,
        "total_tokens": 28,
    }


@pytest.mark.asyncio
async def test_emit_usage_invokes_callback_with_provider_context():
    received: list[UsageRecord] = []

    async def on_usage(record: UsageRecord) -> None:
        received.append(record)

    message = AIMessage(
        content="hi",
        usage_metadata={"input_tokens": 1, "output_tokens": 2, "total_tokens": 3},
    )
    await emit_usage(on_usage, message, provider_type="openai", model="gpt-test")

    assert len(received) == 1
    assert received[0].total_tokens == 3
    assert received[0].model == "gpt-test"


@pytest.mark.asyncio
async def test_emit_usage_skips_messages_without_usage():
    received: list[UsageRecord] = []

    async def on_usage(record: UsageRecord) -> None:
        received.append(record)

    await emit_usage(on_usage, AIMessage(content="hi"))
    assert received == []


def test_projection_accumulates_token_usage_by_role():
    projection: dict = {}
    _accumulate_token_usage(
        projection,
        {"role": "proposer", "input_tokens": 100, "output_tokens": 50, "total_tokens": 150},
    )
    _accumulate_token_usage(
        projection,
        {"role": "proposer", "input_tokens": 10, "output_tokens": 5, "total_tokens": 15},
    )
    _accumulate_token_usage(
        projection,
        {"node": "manage_context", "input_tokens": 30, "output_tokens": 6, "total_tokens": 36},
    )

    usage = projection["token_usage"]
    assert usage["total"] == {
        "input_tokens": 140,
        "output_tokens": 61,
        "total_tokens": 201,
        "calls": 3,
    }
    assert usage["by_role"]["proposer"]["total_tokens"] == 165
    assert usage["by_role"]["proposer"]["calls"] == 2
    assert usage["by_role"]["manage_context"]["total_tokens"] == 36
