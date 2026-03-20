"""
Tests for debater guardrails around tool usage and speech streaming.
"""

from __future__ import annotations

import pytest
from langchain_core.messages import AIMessage, ToolMessage

from app.agents import debater


def test_looks_like_search_dump_detects_search_transcript():
    text = """I'll search for "topic".
Here are the search results for "topic":
Source: https://example.com/a
Source: https://example.com/b
"""

    assert debater._looks_like_search_dump(text) is True


@pytest.mark.asyncio
async def test_debater_repairs_search_dump_into_final_speech(monkeypatch):
    async def fake_invoke_chat_model(messages, *, override=None, tools=None, on_token=None, on_progress=None, timeout_seconds=None, heartbeat_interval_seconds=None):
        return AIMessage(
            content=(
                'I\'ll search for "topic".\n'
                'Here are the search results for "topic":\n'
                'Source: https://example.com/a\n'
                'Source: https://example.com/b'
            )
        )

    async def fake_invoke_text_model(messages, *, override=None, tools=None, on_token=None, on_progress=None, timeout_seconds=None, heartbeat_interval_seconds=None):
        return "这是整理后的正式辩论发言。"

    monkeypatch.setattr(debater, "get_debater_system_prompt", lambda role: "系统提示")
    monkeypatch.setattr(debater, "invoke_chat_model", fake_invoke_chat_model)
    monkeypatch.setattr(debater, "invoke_text_model", fake_invoke_text_model)
    monkeypatch.setattr(debater, "get_all_skills", lambda: [])

    result = await debater.debater_speak(
        {
            "current_speaker": "proposer",
            "topic": "GFW防火墙是合理且利大于弊的",
            "current_turn": 0,
            "max_turns": 5,
            "dialogue_history": [],
            "shared_knowledge": [],
            "messages": [
                ToolMessage(
                    content="Search Results for 'GFW': Source: example",
                    tool_call_id="tool-1",
                    name="web_search",
                )
            ],
            "agent_configs": {},
        }
    )

    assert result["dialogue_history"][0]["content"] == "这是整理后的正式辩论发言。"
    assert result["recent_dialogue_history"][-1]["content"] == "这是整理后的正式辩论发言。"


@pytest.mark.asyncio
async def test_debater_streams_tokens_through_runtime_event_emitter(monkeypatch):
    emitted: list[tuple[str, dict[str, object]]] = []

    class _RuntimeEmitter:
        async def emit_speech_start(self, session_id, *, role, agent_name, turn):
            emitted.append((
                "speech_start",
                {
                    "session_id": session_id,
                    "role": role,
                    "agent_name": agent_name,
                    "turn": turn,
                },
            ))

        async def emit_speech_token(self, session_id, *, role, agent_name, token, turn):
            emitted.append((
                "speech_token",
                {
                    "session_id": session_id,
                    "role": role,
                    "agent_name": agent_name,
                    "token": token,
                    "turn": turn,
                },
            ))

        async def emit_speech_cancel(self, session_id, *, role, agent_name, turn):
            emitted.append((
                "speech_cancel",
                {
                    "session_id": session_id,
                    "role": role,
                    "agent_name": agent_name,
                    "turn": turn,
                },
            ))

    async def fake_invoke_chat_model(messages, *, override=None, tools=None, on_token=None, on_progress=None, timeout_seconds=None, heartbeat_interval_seconds=None):
        assert on_token is not None
        await on_token("实时")
        await on_token("输出")
        return AIMessage(content="实时输出")

    monkeypatch.setattr(debater, "get_debater_system_prompt", lambda role: "系统提示")
    monkeypatch.setattr(debater, "invoke_chat_model", fake_invoke_chat_model)
    monkeypatch.setattr(debater, "get_all_skills", lambda: [])

    result = await debater.debater_speak(
        {
            "session_id": "abc123def456",
            "current_speaker": "proposer",
            "topic": "测试实时输出",
            "current_turn": 0,
            "max_turns": 3,
            "dialogue_history": [],
            "shared_knowledge": [],
            "messages": [],
            "agent_configs": {},
            "runtime_event_emitter": _RuntimeEmitter(),
        }
    )

    assert [kind for kind, _payload in emitted] == [
        "speech_start",
        "speech_token",
        "speech_token",
    ]
    assert result["dialogue_history"][0]["content"] == "实时输出"
    assert result["speech_was_streamed"] is True
