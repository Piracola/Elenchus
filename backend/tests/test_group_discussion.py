from __future__ import annotations

import pytest
from langchain_core.messages import HumanMessage

from app.agents import group_discussion


@pytest.mark.asyncio
async def test_group_discussion_appends_entries_to_recent_context(monkeypatch):
    captured_instructions: list[str] = []

    async def fake_refresh_agent_configs(state):
        return state.get("agent_configs", {})

    async def fake_invoke_text_model(
        messages,
        *,
        override=None,
        on_progress=None,
        timeout_seconds=None,
        heartbeat_interval_seconds=None,
        max_retries=None,
    ):
        captured_instructions.append(
            next(message.content for message in messages if isinstance(message, HumanMessage))
        )
        return "本轮赛前简报。"

    monkeypatch.setattr(group_discussion, "refresh_agent_configs_for_session", fake_refresh_agent_configs)
    monkeypatch.setattr(group_discussion, "invoke_text_model", fake_invoke_text_model)
    monkeypatch.setattr(group_discussion, "get_group_discussion_prompt", lambda: "系统提示")

    result = await group_discussion.run_group_discussion(
        {
            "topic": "AI 是否应被严格监管",
            "current_turn": 0,
            "max_turns": 3,
            "dialogue_history": [],
            "shared_knowledge": [],
            "judge_history": [],
            "reasoning_config": {"group_discussion_rounds": 1},
            "speech_config": {},
            "agent_configs": {},
        }
    )

    assert captured_instructions
    assert "回合开始前的组内讨论" in captured_instructions[0]
    assert "本轮赛前讨论纪要" in captured_instructions[0]
    assert result["dialogue_history"][0]["role"] == "group_discussion"
    assert result["dialogue_history"][-1]["content"] == "本轮赛前简报。"


@pytest.mark.asyncio
async def test_group_discussion_generates_only_missing_rounds_after_resume(monkeypatch):
    calls = 0
    captured_instructions: list[str] = []

    async def fake_refresh_agent_configs(state):
        return state.get("agent_configs", {})

    async def fake_invoke_text_model(
        messages,
        *,
        override=None,
        on_progress=None,
        timeout_seconds=None,
        heartbeat_interval_seconds=None,
        max_retries=None,
    ):
        nonlocal calls
        calls += 1
        captured_instructions.append(
            next(message.content for message in messages if isinstance(message, HumanMessage))
        )
        return f"补充讨论 {calls}"

    monkeypatch.setattr(group_discussion, "refresh_agent_configs_for_session", fake_refresh_agent_configs)
    monkeypatch.setattr(group_discussion, "invoke_text_model", fake_invoke_text_model)
    monkeypatch.setattr(group_discussion, "get_group_discussion_prompt", lambda: "系统提示")

    result = await group_discussion.run_group_discussion(
        {
            "topic": "AI 是否应被严格监管",
            "current_turn": 1,
            "max_turns": 3,
            "dialogue_history": [
                {
                    "role": "group_discussion",
                    "agent_name": "组内讨论",
                    "content": "已完成讨论 1",
                    "turn": 1,
                    "discussion_round": 1,
                }
            ],
            "shared_knowledge": [],
            "judge_history": [],
            "reasoning_config": {"group_discussion_rounds": 2},
            "speech_config": {},
            "agent_configs": {},
        }
    )

    assert calls == 1
    assert "已完成讨论 1" in captured_instructions[0]
    assert len(result["dialogue_history"]) == 1
    assert result["dialogue_history"][0]["discussion_round"] == 2


@pytest.mark.asyncio
async def test_group_discussion_skips_when_required_rounds_already_exist(monkeypatch):
    calls = 0

    async def fake_refresh_agent_configs(state):
        return state.get("agent_configs", {})

    async def fake_invoke_text_model(*args, **kwargs):
        nonlocal calls
        calls += 1
        return "不应再次生成"

    monkeypatch.setattr(group_discussion, "refresh_agent_configs_for_session", fake_refresh_agent_configs)
    monkeypatch.setattr(group_discussion, "invoke_text_model", fake_invoke_text_model)
    monkeypatch.setattr(group_discussion, "get_group_discussion_prompt", lambda: "系统提示")

    result = await group_discussion.run_group_discussion(
        {
            "topic": "AI 是否应被严格监管",
            "current_turn": 0,
            "max_turns": 3,
            "dialogue_history": [
                {
                    "role": "group_discussion",
                    "agent_name": "组内讨论",
                    "content": "已完成讨论 1",
                    "turn": 0,
                    "discussion_round": 1,
                }
            ],
            "shared_knowledge": [],
            "judge_history": [],
            "reasoning_config": {"group_discussion_rounds": 1},
            "speech_config": {},
            "agent_configs": {},
        }
    )

    assert calls == 0
    assert result == {}


@pytest.mark.asyncio
async def test_group_discussion_retries_with_retry_after_then_writes_error_entry(monkeypatch):
    attempts = 0
    sleep_calls: list[float] = []

    async def fake_refresh_agent_configs(state):
        return state.get("agent_configs", {})

    async def fake_invoke_text_model(
        messages,
        *,
        override=None,
        on_progress=None,
        timeout_seconds=None,
        heartbeat_interval_seconds=None,
        max_retries=None,
    ):
        nonlocal attempts
        attempts += 1
        raise RuntimeError("Error code: 504 - {'retry_after': 120, 'error_name': 'origin_gateway_timeout'}")

    async def fake_sleep(seconds):
        sleep_calls.append(seconds)

    monkeypatch.setattr(group_discussion, "refresh_agent_configs_for_session", fake_refresh_agent_configs)
    monkeypatch.setattr(group_discussion, "invoke_text_model", fake_invoke_text_model)
    monkeypatch.setattr(group_discussion, "get_group_discussion_prompt", lambda: "系统提示")
    monkeypatch.setattr(group_discussion.asyncio, "sleep", fake_sleep)

    result = await group_discussion.run_group_discussion(
        {
            "topic": "AI 是否应被严格监管",
            "current_turn": 0,
            "max_turns": 3,
            "dialogue_history": [],
            "recent_dialogue_history": [],
            "shared_knowledge": [],
            "judge_history": [],
            "reasoning_config": {"group_discussion_rounds": 1},
            "speech_config": {},
            "agent_configs": {},
        }
    )

    assert attempts == 3
    assert sleep_calls == [120, 120]
    assert result["dialogue_history"][0]["role"] == "group_discussion"
    assert "上游模型服务超时" in result["dialogue_history"][0]["content"]


@pytest.mark.asyncio
async def test_group_discussion_uses_context_model_override(monkeypatch):
    captured_override: dict[str, object] | None = None

    async def fake_refresh_agent_configs(state):
        return {
            "group_discussion": {
                "provider_id": "old-provider",
                "model": "gpt-4o",
                "custom_name": "赛前简报",
                "custom_prompt": "请更短。",
            }
        }

    async def fake_invoke_text_model(
        messages,
        *,
        override=None,
        on_progress=None,
        timeout_seconds=None,
        heartbeat_interval_seconds=None,
        max_retries=None,
    ):
        nonlocal captured_override
        captured_override = dict(override or {})
        return "本轮赛前简报。"

    async def fake_build_context_helper_override():
        return {
            "provider_id": "provider-2",
            "model": "deepseek-v4-flash",
        }

    monkeypatch.setattr(group_discussion, "refresh_agent_configs_for_session", fake_refresh_agent_configs)
    monkeypatch.setattr(group_discussion, "invoke_text_model", fake_invoke_text_model)
    monkeypatch.setattr(group_discussion, "get_group_discussion_prompt", lambda: "系统提示")
    monkeypatch.setattr(
        group_discussion,
        "build_context_helper_override",
        fake_build_context_helper_override,
    )

    result = await group_discussion.run_group_discussion(
        {
            "topic": "AI 是否应被严格监管",
            "current_turn": 0,
            "max_turns": 3,
            "dialogue_history": [],
            "shared_knowledge": [],
            "judge_history": [],
            "reasoning_config": {"group_discussion_rounds": 1},
            "speech_config": {},
            "agent_configs": {},
        }
    )

    assert captured_override is not None
    assert captured_override["provider_id"] == "provider-2"
    assert captured_override["model"] == "deepseek-v4-flash"
    assert captured_override["custom_name"] == "赛前简报"
    assert result["dialogue_history"][0]["agent_name"] == "赛前简报"
