from __future__ import annotations

import pytest

from app.models.schemas import SessionCreate
from app.runtime.session_repository import SessionRuntimeRepository
from app.services import session_service


async def _create_session_with_snapshot(db_session, *, current_turn: int, snapshot: dict):
    created = await session_service.create_session(
        db_session,
        SessionCreate(topic="Resume normalization", max_turns=3),
    )
    updated = await session_service.update_session_state(
        db_session,
        created["id"],
        current_turn=current_turn,
        status="in_progress",
        state_snapshot=snapshot,
    )
    assert updated is not None
    return created


@pytest.mark.asyncio
async def test_build_initial_state_rolls_back_incomplete_speaker_turn(db_session):
    created = await _create_session_with_snapshot(
        db_session,
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
            "team_dialogue_history": [],
            "jury_dialogue_history": [],
            "judge_history": [],
            "recent_dialogue_history": [
                {
                    "role": "opposer",
                    "agent_name": "Opposer",
                    "content": "partial turn 1",
                    "citations": [],
                    "timestamp": "2026-03-20T00:00:10Z",
                    "turn": 1,
                }
            ],
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
        created["id"],
        topic=created["topic"],
        participants=created["participants"],
        max_turns=created["max_turns"],
        agent_configs=created.get("agent_configs", {}),
    )

    assert state is not None
    assert [entry["turn"] for entry in state["dialogue_history"]] == [0]
    assert state["shared_knowledge"] == [{"type": "memo", "content": "turn 0 summary", "source_turn": 0}]
    assert state["recent_dialogue_history"] == state["dialogue_history"]
    assert state["current_speaker"] == ""
    assert state["current_speaker_index"] == -1
    assert state["messages"] == []
    assert state["current_scores"] == {}
    assert state["cumulative_scores"] == {}
    assert state["last_executed_node"] == "manage_context"
    assert state["last_status_message"] == ""


@pytest.mark.asyncio
async def test_build_initial_state_clears_partial_judge_outputs_for_current_turn(db_session):
    created = await _create_session_with_snapshot(
        db_session,
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
            "team_dialogue_history": [],
            "jury_dialogue_history": [],
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
async def test_build_initial_state_preserves_completed_turn_at_advance_turn_boundary(db_session):
    created = await _create_session_with_snapshot(
        db_session,
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
            "team_dialogue_history": [],
            "jury_dialogue_history": [],
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
async def test_build_initial_state_rolls_back_turn_scoped_mode_artifacts_and_discussions(db_session):
    created = await _create_session_with_snapshot(
        db_session,
        current_turn=1,
        snapshot={
            "dialogue_history": [],
            "team_dialogue_history": [
                {
                    "role": "team_member",
                    "agent_name": "Team A",
                    "content": "team turn 0",
                    "citations": [],
                    "timestamp": "2026-03-20T00:00:00Z",
                    "turn": 0,
                },
                {
                    "role": "team_member",
                    "agent_name": "Team A",
                    "content": "team turn 1",
                    "citations": [],
                    "timestamp": "2026-03-20T00:00:10Z",
                    "turn": 1,
                },
            ],
            "jury_dialogue_history": [
                {
                    "role": "jury_member",
                    "agent_name": "Jury",
                    "content": "jury turn 1",
                    "citations": [],
                    "timestamp": "2026-03-20T00:00:11Z",
                    "turn": 1,
                }
            ],
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
            "current_team_discussion": [{"content": "temp"}],
            "current_team_summary": {"content": "temp"},
            "current_jury_discussion": [{"content": "temp"}],
            "current_jury_summary": {"content": "temp"},
            "current_scores": {},
            "cumulative_scores": {},
            "agent_configs": {},
            "last_executed_node": "team_discussion",
        },
    )

    state = await SessionRuntimeRepository().build_initial_state(
        created["id"],
        topic=created["topic"],
        participants=created["participants"],
        max_turns=created["max_turns"],
        agent_configs=created.get("agent_configs", {}),
    )

    assert state is not None
    assert [entry["turn"] for entry in state["team_dialogue_history"]] == [0]
    assert state["jury_dialogue_history"] == []
    assert state["shared_knowledge"] == [{"type": "memo", "content": "keep", "source_turn": 0}]
    assert state["mode_artifacts"] == [{"type": "sophistry_round_report", "turn": 0, "content": "keep"}]
    assert state["current_mode_report"] is None
    assert state["current_team_discussion"] == []
    assert state["current_team_summary"] is None
    assert state["current_jury_discussion"] == []
    assert state["current_jury_summary"] is None
    assert state["last_executed_node"] == "manage_context"
