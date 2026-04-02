from __future__ import annotations

import pytest

from app.agents import sophistry_observer


@pytest.mark.asyncio
async def test_sophistry_observer_report_records_source_mapping(monkeypatch):
    async def fake_invoke_text_model(messages, *, override=None, on_progress=None, timeout_seconds=None, heartbeat_interval_seconds=None):
        return "观察员总结"

    monkeypatch.setattr(sophistry_observer, "get_sophistry_observer_prompt", lambda: "系统提示")
    monkeypatch.setattr(sophistry_observer, "invoke_text_model", fake_invoke_text_model)

    result = await sophistry_observer.sophistry_observer_report(
        {
            "topic": "测试辩题",
            "current_turn": 0,
            "participants": ["proposer", "opposer"],
            "dialogue_history": [
                {
                    "role": "proposer",
                    "agent_name": "正方",
                    "content": "第一条发言",
                    "turn": 0,
                },
                {
                    "role": "opposer",
                    "agent_name": "反方",
                    "content": "第二条发言",
                    "turn": 0,
                },
            ],
            "mode_artifacts": [],
            "agent_configs": {},
        }
    )

    entry = result["dialogue_history"][0]
    artifact = result["mode_artifacts"][0]

    assert entry["source_turn"] == 0
    assert entry["source_roles"] == ["proposer", "opposer"]
    assert artifact["source_turn"] == 0
    assert artifact["source_roles"] == ["proposer", "opposer"]
