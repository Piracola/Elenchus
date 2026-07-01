from __future__ import annotations

import pytest

from app.models.schemas import SessionCreate
from app.runtime.session_repository import SessionRuntimeRepository
from app.services import run_service, session_service


async def _create_session_with_snapshot(*, current_turn: int, snapshot: dict):
    created = await session_service.create_session(
        SessionCreate(topic="Resume normalization", max_turns=3),
    )
    run = await run_service.create_run(
        created["id"],
        topic=created["topic"],
        participants=created["participants"],
        max_turns=created["max_turns"],
        agent_configs=created.get("agent_configs", {}),
    )
    updated = await run_service.update_run_state(
        run["run"]["id"],
        current_turn=current_turn,
        status="in_progress",
        state_snapshot=snapshot,
    )
    assert updated is not None
    return created, run["run"]["id"]


@pytest.mark.asyncio
async def test_build_initial_state_uses_requested_run_projection_not_latest_run():
    created = await session_service.create_session(
        SessionCreate(topic="Multiple runs", max_turns=3),
    )
    first = await run_service.create_run(
        created["id"],
        topic="First run topic",
        participants=created["participants"],
        max_turns=created["max_turns"],
        agent_configs=created.get("agent_configs", {}),
    )
    second = await run_service.create_run(
        created["id"],
        topic="Second run topic",
        participants=created["participants"],
        max_turns=created["max_turns"],
        agent_configs=created.get("agent_configs", {}),
    )
    first_run_id = first["run"]["id"]
    second_run_id = second["run"]["id"]

    await run_service.update_run_state(
        first_run_id,
        current_turn=1,
        status="in_progress",
        state_snapshot={
            "dialogue_history": [
                {
                    "role": "proposer",
                    "agent_name": "Proposer",
                    "content": "first run content",
                    "citations": [],
                    "timestamp": "2026-03-20T00:00:00Z",
                    "turn": 0,
                }
            ],
            "shared_knowledge": [{"type": "memo", "content": "first run memo"}],
            "current_scores": {},
            "cumulative_scores": {},
            "agent_configs": {},
        },
    )
    await run_service.update_run_state(
        second_run_id,
        current_turn=2,
        status="in_progress",
        state_snapshot={
            "dialogue_history": [
                {
                    "role": "opposer",
                    "agent_name": "Opposer",
                    "content": "latest run content",
                    "citations": [],
                    "timestamp": "2026-03-20T00:01:00Z",
                    "turn": 1,
                }
            ],
            "shared_knowledge": [{"type": "memo", "content": "latest run memo"}],
            "current_scores": {},
            "cumulative_scores": {},
            "agent_configs": {},
        },
    )

    state = await SessionRuntimeRepository().build_initial_state(
        first_run_id,
        created["id"],
        topic="First run topic",
        participants=created["participants"],
        max_turns=created["max_turns"],
        agent_configs=created.get("agent_configs", {}),
    )

    assert state is not None
    assert state["run_id"] == first_run_id
    assert state["current_turn"] == 1
    assert state["dialogue_history"][0]["content"] == "first run content"
    assert state["shared_knowledge"] == [{"type": "memo", "content": "first run memo"}]


@pytest.mark.asyncio
async def test_build_initial_state_rolls_back_incomplete_speaker_turn():
    created, run_id = await _create_session_with_snapshot(
        current_turn=1,
        snapshot={
            "dialogue_history": [
                {
                    "role": "proposer",
                    "agent_name": "Proposer",
                    "content": "turn 0",
                    "citations": [],
                    "timestamp": "2026-03-20T00:00:00Z",
                    "turn": 0,
                },
                {
                    "role": "opposer",
                    "agent_name": "Opposer",
                    "content": "partial turn 1",
                    "citations": [],
                    "timestamp": "2026-03-20T00:00:10Z",
                    "turn": 1,
                },
            ],
            "judge_history": [],
            "shared_knowledge": [
                {"type": "memo", "content": "turn 0 summary", "source_turn": 0},
                {"type": "fact", "content": "turn 1 fact", "source_turn": 1},
            ],
            "current_scores": {"proposer": {"overall_comment": "partial"}},
            "cumulative_scores": {"proposer": {"logical_rigor": [7, 8]}},
            "agent_configs": {},
            "messages": [{"type": "ai", "content": "tool scratchpad"}],
            "current_speaker": "opposer",
            "current_speaker_index": 1,
            "last_executed_node": "speaker",
            "last_status_message": "正在发言...",
        },
    )

    state = await SessionRuntimeRepository().build_initial_state(
        run_id,
        created["id"],
        topic=created["topic"],
        participants=created["participants"],
        max_turns=created["max_turns"],
        agent_configs=created.get("agent_configs", {}),
    )

    assert state is not None
    assert [entry["turn"] for entry in state["dialogue_history"]] == [0]
    assert state["shared_knowledge"] == [{"type": "memo", "content": "turn 0 summary", "source_turn": 0}]
    assert state["current_speaker"] == ""
    assert state["current_speaker_index"] == -1
    assert state["messages"] == []
    assert state["current_scores"] == {}
    assert state["cumulative_scores"] == {}
    assert state["last_executed_node"] == "manage_context"
    assert state["last_status_message"] == ""


@pytest.mark.asyncio
async def test_build_initial_state_clears_partial_judge_outputs_for_current_turn():
    created, run_id = await _create_session_with_snapshot(
        current_turn=1,
        snapshot={
            "dialogue_history": [
                {
                    "role": "proposer",
                    "agent_name": "Proposer",
                    "content": "turn 0",
                    "citations": [],
                    "timestamp": "2026-03-20T00:00:00Z",
                    "turn": 0,
                }
            ],
            "judge_history": [
                {
                    "role": "judge",
                    "target_role": "proposer",
                    "agent_name": "裁判组视角",
                    "content": "turn 0 judge",
                    "scores": {
                        "logical_rigor": {"score": 7, "rationale": "ok"},
                        "overall_comment": "turn 0",
                    },
                    "citations": [],
                    "timestamp": "2026-03-20T00:00:01Z",
                    "turn": 0,
                },
                {
                    "role": "judge",
                    "target_role": "proposer",
                    "agent_name": "裁判组视角",
                    "content": "turn 1 judge",
                    "scores": {
                        "logical_rigor": {"score": 9, "rationale": "great"},
                        "overall_comment": "turn 1",
                    },
                    "citations": [],
                    "timestamp": "2026-03-20T00:00:11Z",
                    "turn": 1,
                },
            ],
            "shared_knowledge": [],
            "current_scores": {"proposer": {"overall_comment": "turn 1 partial"}},
            "cumulative_scores": {"proposer": {"logical_rigor": [7, 9]}},
            "agent_configs": {},
            "last_executed_node": "judge",
        },
    )

    state = await SessionRuntimeRepository().build_initial_state(
        run_id,
        created["id"],
        topic=created["topic"],
        participants=created["participants"],
        max_turns=created["max_turns"],
        agent_configs=created.get("agent_configs", {}),
    )

    assert state is not None
    assert len(state["judge_history"]) == 1
    assert state["judge_history"][0]["turn"] == 0
    assert state["current_scores"] == {}
    assert state["cumulative_scores"] == {"proposer": {"logical_rigor": [7]}}
    assert state["last_executed_node"] == "manage_context"


@pytest.mark.asyncio
async def test_build_initial_state_preserves_completed_turn_at_advance_turn_boundary():
    created, run_id = await _create_session_with_snapshot(
        current_turn=1,
        snapshot={
            "dialogue_history": [
                {
                    "role": "proposer",
                    "agent_name": "Proposer",
                    "content": "completed turn 0",
                    "citations": [],
                    "timestamp": "2026-03-20T00:00:00Z",
                    "turn": 0,
                }
            ],
            "judge_history": [
                {
                    "role": "judge",
                    "target_role": "proposer",
                    "agent_name": "裁判组视角",
                    "content": "turn 0 judge",
                    "scores": {
                        "logical_rigor": {"score": 8, "rationale": "ok"},
                        "overall_comment": "done",
                    },
                    "citations": [],
                    "timestamp": "2026-03-20T00:00:01Z",
                    "turn": 0,
                }
            ],
            "shared_knowledge": [
                {"type": "memo", "content": "turn 0 summary", "source_turn": 0}
            ],
            "current_scores": {"proposer": {"overall_comment": "done"}},
            "cumulative_scores": {"proposer": {"logical_rigor": [8]}},
            "agent_configs": {},
            "last_executed_node": "advance_turn",
        },
    )

    state = await SessionRuntimeRepository().build_initial_state(
        run_id,
        created["id"],
        topic=created["topic"],
        participants=created["participants"],
        max_turns=created["max_turns"],
        agent_configs=created.get("agent_configs", {}),
    )

    assert state is not None
    assert len(state["dialogue_history"]) == 1
    assert state["dialogue_history"][0]["turn"] == 0
    assert len(state["judge_history"]) == 1
    assert state["shared_knowledge"] == [{"type": "memo", "content": "turn 0 summary", "source_turn": 0}]
    assert state["current_scores"] == {"proposer": {"overall_comment": "done"}}
    assert state["cumulative_scores"] == {"proposer": {"logical_rigor": [8]}}
    assert state["last_executed_node"] == "advance_turn"


@pytest.mark.asyncio
async def test_build_initial_state_preserves_pre_round_group_discussion_boundary():
    created, run_id = await _create_session_with_snapshot(
        current_turn=1,
        snapshot={
            "dialogue_history": [
                {
                    "role": "group_discussion",
                    "agent_name": "组内讨论",
                    "content": "turn 1 brief",
                    "citations": [],
                    "timestamp": "2026-03-20T00:00:00Z",
                    "turn": 1,
                    "discussion_kind": "group_discussion",
                    "discussion_round": 1,
                }
            ],
            "judge_history": [],
            "shared_knowledge": [],
            "current_scores": {},
            "cumulative_scores": {},
            "agent_configs": {},
            "last_executed_node": "group_discussion",
        },
    )

    state = await SessionRuntimeRepository().build_initial_state(
        run_id,
        created["id"],
        topic=created["topic"],
        participants=created["participants"],
        max_turns=created["max_turns"],
        agent_configs=created.get("agent_configs", {}),
    )

    assert state is not None
    assert len(state["dialogue_history"]) == 1
    assert state["dialogue_history"][0]["role"] == "group_discussion"
    assert state["last_executed_node"] == "group_discussion"


@pytest.mark.asyncio
async def test_build_initial_state_rolls_back_turn_scoped_mode_artifacts():
    created, run_id = await _create_session_with_snapshot(
        current_turn=1,
        snapshot={
            "dialogue_history": [],
            "judge_history": [],
            "shared_knowledge": [
                {"type": "memo", "content": "keep", "source_turn": 0},
                {"type": "memo", "content": "drop", "turn": 1},
            ],
            "mode_artifacts": [
                {"type": "sophistry_round_report", "turn": 0, "content": "keep"},
                {"type": "sophistry_round_report", "turn": 1, "content": "drop"},
            ],
            "current_mode_report": {"type": "sophistry_round_report", "turn": 1, "content": "drop"},
            "current_scores": {},
            "cumulative_scores": {},
            "agent_configs": {},
            "last_executed_node": "sophistry_observer",
        },
    )

    state = await SessionRuntimeRepository().build_initial_state(
        run_id,
        created["id"],
        topic=created["topic"],
        participants=created["participants"],
        max_turns=created["max_turns"],
        agent_configs=created.get("agent_configs", {}),
    )

    assert state is not None
    assert state["shared_knowledge"] == [{"type": "memo", "content": "keep", "source_turn": 0}]
    assert state["mode_artifacts"] == [{"type": "sophistry_round_report", "turn": 0, "content": "keep"}]
    assert state["current_mode_report"] is None
    assert state["last_executed_node"] == "manage_context"
