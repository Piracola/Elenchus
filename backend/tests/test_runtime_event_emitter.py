from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from app.runtime.event_emitter import RuntimeEventEmitter


class _FakeRuntimeBus:
    def __init__(self) -> None:
        self.events: list[dict[str, Any]] = []

    async def emit(
        self,
        *,
        session_id: str,
        event_type: str,
        payload: dict[str, Any] | None = None,
        source: str = "runtime",
        phase: str | None = None,
    ) -> None:
        self.events.append(
            {
                "session_id": session_id,
                "type": event_type,
                "payload": payload or {},
                "source": source,
                "phase": phase,
            }
        )


def test_predict_next_status_node_handles_tools_and_turn_progress():
    emitter = RuntimeEventEmitter()

    assert emitter.predict_next_status_node(
        "set_speaker",
        {"current_speaker": "proposer"},
    ) == "speaker"
    assert emitter.predict_next_status_node(
        "set_speaker",
        {
            "current_speaker": "proposer",
            "team_config": {"agents_per_team": 2, "discussion_rounds": 1},
        },
    ) == "team_discussion"
    assert emitter.predict_next_status_node("team_discussion", {}) == "speaker"
    assert emitter.predict_next_status_node("jury_discussion", {}) == "judge"
    assert emitter.predict_next_status_node(
        "speaker",
        {"messages": [SimpleNamespace(tool_calls=[{"name": "web_search"}])]},
    ) == "tool_executor"
    assert emitter.predict_next_status_node(
        "speaker",
        {
            "participants": ["proposer", "opposer"],
            "current_speaker_index": 1,
            "jury_config": {"agents_per_jury": 3, "discussion_rounds": 2},
        },
    ) == "jury_discussion"
    assert emitter.predict_next_status_node(
        "advance_turn",
        {"current_turn": 1, "max_turns": 3},
    ) == "manage_context"
    assert emitter.predict_next_status_node(
        "advance_turn",
        {
            "current_turn": 3,
            "max_turns": 3,
            "reasoning_config": {"consensus_enabled": True},
        },
    ) == "consensus"
    assert emitter.predict_next_status_node(
        "set_speaker",
        {
            "debate_mode": "sophistry_experiment",
            "current_speaker": "proposer",
        },
    ) == "sophistry_speaker"
    assert emitter.predict_next_status_node(
        "sophistry_speaker",
        {
            "participants": ["proposer", "opposer"],
            "current_speaker_index": 1,
        },
    ) == "sophistry_observer"
    assert emitter.predict_next_status_node(
        "advance_turn",
        {
            "debate_mode": "sophistry_experiment",
            "current_turn": 3,
            "max_turns": 3,
        },
    ) == "sophistry_postmortem"


@pytest.mark.asyncio
async def test_emit_memory_updates_routes_fact_and_memo_sources():
    bus = _FakeRuntimeBus()
    emitter = RuntimeEventEmitter(runtime_bus=bus)

    count = await emitter.emit_memory_updates(
        "session-1",
        {
            "shared_knowledge": [
                {"type": "fact", "query": "AI", "result": "fact-result"},
                {"type": "memo", "agent_name": "Proposer", "content": "memo-result"},
            ]
        },
        0,
    )

    assert count == 2
    assert [event["source"] for event in bus.events] == [
        "runtime.node.tool_executor",
        "runtime.node.manage_context",
    ]
    assert [event["payload"]["memory_type"] for event in bus.events] == ["fact", "memo"]


@pytest.mark.asyncio
async def test_emit_team_discussion_uses_separate_event_types():
    bus = _FakeRuntimeBus()
    emitter = RuntimeEventEmitter(runtime_bus=bus)

    count = await emitter.emit_team_discussion(
        "session-1",
        {
            "team_dialogue_history": [
                {
                    "role": "team_member",
                    "agent_name": "正方组员1",
                    "content": "补强证据链",
                    "team_side": "proposer",
                    "team_round": 0,
                    "team_member_index": 0,
                    "team_specialty": "证据审查",
                    "source_role": "proposer",
                },
                {
                    "role": "team_summary",
                    "agent_name": "正方总结员",
                    "content": "优先打价值框架和证据可信度。",
                    "team_side": "proposer",
                    "team_round": 0,
                    "source_role": "proposer",
                },
            ]
        },
        0,
    )

    assert count == 2
    assert [event["type"] for event in bus.events] == ["team_discussion", "team_summary"]


@pytest.mark.asyncio
async def test_emit_jury_discussion_uses_separate_event_types():
    bus = _FakeRuntimeBus()
    emitter = RuntimeEventEmitter(runtime_bus=bus)

    count = await emitter.emit_jury_discussion(
        "session-1",
        {
            "jury_dialogue_history": [
                {
                    "role": "jury_member",
                    "agent_name": "陪审员1",
                    "content": "请继续追问关键前提。",
                    "turn": 0,
                    "jury_round": 0,
                    "jury_member_index": 0,
                    "jury_perspective": "隐藏前提挖掘",
                },
                {
                    "role": "jury_summary",
                    "agent_name": "陪审团总结员",
                    "content": "双方仍在因果链强度上对冲。",
                    "turn": 0,
                    "jury_round": 0,
                },
                {
                    "role": "consensus_summary",
                    "agent_name": "共识收敛员",
                    "content": "可以先收敛到“条件依赖型结论”。",
                    "turn": 3,
                },
            ]
        },
        0,
    )

    assert count == 3
    assert [event["type"] for event in bus.events] == [
        "jury_discussion",
        "jury_summary",
        "consensus_summary",
    ]


@pytest.mark.asyncio
async def test_emit_speech_skips_duplicate_start_when_tokens_already_streamed():
    bus = _FakeRuntimeBus()
    emitter = RuntimeEventEmitter(runtime_bus=bus)

    count = await emitter.emit_speech(
        "session-1",
        {
            "speech_was_streamed": True,
            "dialogue_history": [
                {
                    "role": "proposer",
                    "agent_name": "正方",
                    "content": "实时输出完成",
                    "turn": 0,
                    "citations": [],
                }
            ],
        },
        0,
    )

    assert count == 1
    assert [event["type"] for event in bus.events] == ["speech_end"]


@pytest.mark.asyncio
async def test_emit_speech_uses_sophistry_speaker_source_for_experiment_mode():
    bus = _FakeRuntimeBus()
    emitter = RuntimeEventEmitter(runtime_bus=bus)

    await emitter.emit_speech(
        "session-1",
        {
            "debate_mode": "sophistry_experiment",
            "dialogue_history": [
                {
                    "role": "proposer",
                    "agent_name": "姝ｆ柟",
                    "content": "鏂囨湰",
                    "turn": 0,
                    "citations": [],
                }
            ],
        },
        0,
    )

    assert [event["type"] for event in bus.events] == ["speech_start", "speech_end"]
    assert {event["source"] for event in bus.events} == {"runtime.node.sophistry_speaker"}


@pytest.mark.asyncio
async def test_emit_speech_emits_every_new_entry_after_missed_turns():
    bus = _FakeRuntimeBus()
    emitter = RuntimeEventEmitter(runtime_bus=bus)

    count = await emitter.emit_speech(
        "session-1",
        {
            "debate_mode": "sophistry_experiment",
            "dialogue_history": [
                {
                    "role": "proposer",
                    "agent_name": "正方",
                    "content": "第一条",
                    "turn": 0,
                    "citations": [],
                },
                {
                    "role": "opposer",
                    "agent_name": "反方",
                    "content": "第二条",
                    "turn": 0,
                    "citations": [],
                },
                {
                    "role": "proposer",
                    "agent_name": "正方",
                    "content": "第三条",
                    "turn": 1,
                    "citations": [],
                },
            ],
        },
        0,
    )

    assert count == 3
    assert [event["type"] for event in bus.events] == [
        "speech_start",
        "speech_end",
        "speech_end",
        "speech_end",
    ]
    assert [event["payload"]["content"] for event in bus.events if event["type"] == "speech_end"] == [
        "第一条",
        "第二条",
        "第三条",
    ]


@pytest.mark.asyncio
async def test_emit_sophistry_reports_includes_turn_mapping_metadata():
    bus = _FakeRuntimeBus()
    emitter = RuntimeEventEmitter(runtime_bus=bus)

    count = await emitter.emit_sophistry_reports(
        "session-1",
        {
            "dialogue_history": [
                {
                    "role": "proposer",
                    "agent_name": "正方",
                    "content": "先定义标准。",
                    "turn": 0,
                    "citations": [],
                },
                {
                    "role": "opposer",
                    "agent_name": "反方",
                    "content": "我重写争点。",
                    "turn": 0,
                    "citations": [],
                },
                {
                    "role": "sophistry_round_report",
                    "agent_name": "诡辩观察员",
                    "content": "观察报告",
                    "turn": 0,
                    "citations": [],
                },
            ],
            "current_mode_report": {
                "type": "sophistry_round_report",
                "turn": 0,
                "content": "观察报告",
            },
        },
        2,
    )

    assert count == 3
    assert len(bus.events) == 1
    assert bus.events[0]["type"] == "sophistry_round_report"
    assert bus.events[0]["payload"]["source_turn"] == 0
    assert bus.events[0]["payload"]["source_roles"] == ["proposer", "opposer"]
