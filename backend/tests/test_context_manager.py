"""Tests for context compression runtime semantics."""

from __future__ import annotations

import pytest

from app.agents import context_manager


class _DummyContextWindow:
    enable_summary_compression = True
    recent_turns_to_keep = 1


class _DummyDebate:
    context_window = _DummyContextWindow()


class _DummySettings:
    debate = _DummyDebate()


@pytest.mark.asyncio
async def test_compress_context_only_summarizes_new_history(monkeypatch):
    calls: list[str] = []

    async def fake_invoke_text_model(messages, *, override=None, tools=None):
        calls.append(messages[-1].content)
        return f"memo-{len(calls)}"

    history = [
        {"role": "proposer", "agent_name": "A", "content": "p1"},
        {"role": "opposer", "agent_name": "B", "content": "o1"},
        {"role": "proposer", "agent_name": "A", "content": "p2"},
        {"role": "opposer", "agent_name": "B", "content": "o2"},
    ]

    monkeypatch.setattr(context_manager, "get_settings", lambda: _DummySettings())
    monkeypatch.setattr(context_manager, "invoke_text_model", fake_invoke_text_model)

    knowledge, recent_entries, compressed_count = await context_manager.compress_context(
        history,
        [],
        compressed_history_count=0,
    )

    assert compressed_count == 2
    assert [item["content"] for item in knowledge] == ["memo-1", "memo-2"]
    assert knowledge[0]["source_kind"] == "dialogue"
    assert knowledge[0]["source_role"] == "proposer"
    assert knowledge[0]["source_agent_name"] == "A"
    assert knowledge[0]["source_excerpt"] == "p1"
    assert [item["content"] for item in recent_entries] == ["p2", "o2"]

    knowledge_again, recent_again, compressed_count_again = await context_manager.compress_context(
        history,
        knowledge,
        compressed_history_count=compressed_count,
    )

    assert knowledge_again == knowledge
    assert recent_again == recent_entries
    assert compressed_count_again == compressed_count
    assert len(calls) == 2

    history.append({"role": "proposer", "agent_name": "A", "content": "p3"})
    knowledge_grown, recent_grown, compressed_count_grown = await context_manager.compress_context(
        history,
        knowledge_again,
        compressed_history_count=compressed_count_again,
    )

    assert compressed_count_grown == 3
    assert [item["content"] for item in knowledge_grown] == ["memo-1", "memo-2", "memo-3"]
    assert knowledge_grown[2]["source_timestamp"] == ""
    assert [item["content"] for item in recent_grown] == ["o2", "p3"]
