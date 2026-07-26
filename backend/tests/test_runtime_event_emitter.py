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
        run_id: str,
        session_id: str,
        event_type: str,
        payload: dict[str, Any] | None = None,
        source: str = "runtime",
        phase: str | None = None,
    ) -> None:
        self.events.append(
            {
                "run_id": run_id,
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
        {"current_speaker": "proposer"},
    ) == "speaker"
    assert emitter.predict_next_status_node(
        "speaker",
        {"messages": [SimpleNamespace(tool_calls=[{"name": "web_search"}])]},
    ) == "tool_executor"
    assert emitter.predict_next_status_node(
        "manage_context",
        {
            "participants": ["proposer", "opposer"],
            "current_turn": 0,
            "dialogue_history": [],
            "reasoning_config": {"group_discussion_rounds": 1},
        },
    ) == "group_discussion"
    assert emitter.predict_next_status_node(
        "manage_context",
        {
            "participants": ["proposer", "opposer"],
            "current_turn": 0,
            "dialogue_history": [
                {"role": "group_discussion", "turn": 0},
            ],
            "reasoning_config": {"group_discussion_rounds": 1},
        },
    ) == "set_speaker"
    assert emitter.predict_next_status_node(
        "speaker",
        {
            "participants": ["proposer", "opposer"],
            "current_speaker_index": 1,
            "reasoning_config": {"group_discussion_rounds": 1},
        },
    ) == "fact_check"
    assert emitter.predict_next_status_node(
        "speaker",
        {
            "participants": ["proposer", "opposer"],
            "current_speaker_index": 1,
            "reasoning_config": {"group_discussion_rounds": 0, "fact_check_enabled": False},
        },
    ) == "judge"
    assert emitter.predict_next_status_node("fact_check", {}) == "judge"
    assert emitter.predict_next_status_node("group_discussion", {}) == "set_speaker"
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
async def test_emit_runtime_event_requires_run_id():
    emitter = RuntimeEventEmitter(runtime_bus=_FakeRuntimeBus())

    with pytest.raises(ValueError, match="explicit run_id"):
        await emitter.emit_runtime_event(
            session_id="session-1",
            event_type="status",
            payload={"content": "should fail"},
        )


@pytest.mark.asyncio
async def test_emit_memory_updates_routes_fact_and_memo_sources():
    bus = _FakeRuntimeBus()
    emitter = RuntimeEventEmitter(runtime_bus=bus).for_run("run-1")

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
async def test_emit_consensus_summary_uses_dedicated_event_type():
    bus = _FakeRuntimeBus()
    emitter = RuntimeEventEmitter(runtime_bus=bus).for_run("run-1")

    count = await emitter.emit_consensus_summary(
        "session-1",
        {
            "dialogue_history": [
                {"role": "proposer", "agent_name": "正方", "content": "立论", "turn": 0},
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

    assert count == 2
    assert [event["type"] for event in bus.events] == ["consensus_summary"]
    assert bus.events[0]["source"] == "runtime.node.consensus"
    assert bus.events[0]["phase"] == "processing"


@pytest.mark.asyncio
async def test_emit_discussion_entry_routes_consensus_event_shape():
    bus = _FakeRuntimeBus()
    emitter = RuntimeEventEmitter(runtime_bus=bus).for_run("run-1")

    await emitter.emit_discussion_entry(
        "session-1",
        {
            "role": "consensus_summary",
            "agent_name": "共识收敛员",
            "content": "可先收敛到条件依赖结论。",
            "discussion_kind": "consensus",
            "turn": 3,
        },
    )

    assert [event["type"] for event in bus.events] == ["consensus_summary"]
    assert bus.events[0]["source"] == "runtime.node.consensus"
    assert bus.events[0]["phase"] == "processing"


@pytest.mark.asyncio
async def test_emit_discussion_entry_routes_group_discussion_event_shape():
    bus = _FakeRuntimeBus()
    emitter = RuntimeEventEmitter(runtime_bus=bus).for_run("run-1")

    await emitter.emit_discussion_entry(
        "session-1",
        {
            "role": "group_discussion",
            "agent_name": "组内讨论",
            "content": "本轮关键问题是定义边界。",
            "discussion_kind": "group_discussion",
            "discussion_round": 1,
            "turn": 0,
        },
    )

    assert [event["type"] for event in bus.events] == ["group_discussion"]
    assert bus.events[0]["source"] == "runtime.node.group_discussion"
    assert bus.events[0]["phase"] == "processing"
    assert bus.events[0]["payload"]["discussion_round"] == 1


@pytest.mark.asyncio
async def test_emit_speech_skips_duplicate_start_when_tokens_already_streamed():
    bus = _FakeRuntimeBus()
    emitter = RuntimeEventEmitter(runtime_bus=bus).for_run("run-1")

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
                    "metadata": {
                        "unsupported_request_parameters": {
                            "provider": "anthropic",
                            "unsupported_parameters": ["enable_thinking"],
                            "message": "anthropic provider ignored unsupported request parameters: enable_thinking",
                        }
                    },
                }
            ],
        },
        0,
    )

    assert count == 1
    assert [event["type"] for event in bus.events] == ["speech_end"]
    assert bus.events[0]["payload"]["metadata"] == {
        "unsupported_request_parameters": {
            "provider": "anthropic",
            "unsupported_parameters": ["enable_thinking"],
            "message": "anthropic provider ignored unsupported request parameters: enable_thinking",
        }
    }


@pytest.mark.asyncio
async def test_emit_speech_omits_empty_metadata_payload():
    bus = _FakeRuntimeBus()
    emitter = RuntimeEventEmitter(runtime_bus=bus).for_run("run-1")

    await emitter.emit_speech(
        "session-1",
        {
            "dialogue_history": [
                {
                    "role": "proposer",
                    "agent_name": "正方",
                    "content": "普通发言",
                    "turn": 0,
                    "citations": [],
                    "metadata": {},
                }
            ],
        },
        0,
    )

    assert [event["type"] for event in bus.events] == ["speech_start", "speech_end"]
    assert "metadata" not in bus.events[1]["payload"]


@pytest.mark.asyncio
async def test_emit_speech_uses_sophistry_speaker_source_for_experiment_mode():
    bus = _FakeRuntimeBus()
    emitter = RuntimeEventEmitter(runtime_bus=bus).for_run("run-1")

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
    emitter = RuntimeEventEmitter(runtime_bus=bus).for_run("run-1")

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
    emitter = RuntimeEventEmitter(runtime_bus=bus).for_run("run-1")

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
