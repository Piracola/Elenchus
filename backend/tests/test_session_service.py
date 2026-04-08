"""
Smoke tests for session CRUD operations.
"""

import json

import pytest

from app.runtime_paths import get_runtime_paths
from app.services import session_service
from app.services import document_service
from app.storage.session_documents import document_file
from app.models.schemas import SessionCreate


@pytest.mark.asyncio
async def test_create_session():
    body = SessionCreate(topic="AI will replace programmers", max_turns=3)
    result = await session_service.create_session(body)

    assert result["topic"] == "AI will replace programmers"
    assert result["max_turns"] == 3
    assert result["status"] == "pending"
    assert result["current_turn"] == 0
    assert len(result["id"]) == 12
    assert result["team_config"] == {"agents_per_team": 0, "discussion_rounds": 0}
    assert result["jury_config"] == {"agents_per_jury": 0, "discussion_rounds": 0}
    assert result["reasoning_config"] == {
        "steelman_enabled": True,
        "counterfactual_enabled": True,
        "consensus_enabled": True,
    }
    assert result["team_dialogue_history"] == []
    assert result["jury_dialogue_history"] == []


@pytest.mark.asyncio
async def test_list_sessions_empty():
    items = await session_service.list_sessions()
    assert items == []


@pytest.mark.asyncio
async def test_list_sessions_pagination():
    for i in range(5):
        await session_service.create_session(SessionCreate(topic=f"Topic {i}"))

    page1 = await session_service.list_sessions(offset=0, limit=3)
    page2 = await session_service.list_sessions(offset=3, limit=3)

    assert len(page1) == 3
    assert len(page2) == 2
    total = await session_service.count_sessions()
    assert total == 5


@pytest.mark.asyncio
async def test_get_session():
    created = await session_service.create_session(SessionCreate(topic="Test"))
    fetched = await session_service.get_session(created["id"])

    assert fetched is not None
    assert fetched["id"] == created["id"]


@pytest.mark.asyncio
async def test_get_session_not_found():
    result = await session_service.get_session("nonexistent1")
    assert result is None


@pytest.mark.asyncio
async def test_delete_session():
    created = await session_service.create_session(SessionCreate(topic="Delete me"))
    deleted = await session_service.delete_session(created["id"])
    assert deleted is True

    fetched = await session_service.get_session(created["id"])
    assert fetched is None
    assert not (get_runtime_paths().sessions_dir / created["id"]).exists()


@pytest.mark.asyncio
async def test_delete_session_removes_uploaded_documents():
    created = await session_service.create_session(
        SessionCreate(topic="Delete documents"),
    )
    document = await document_service.create_session_document(
        created["id"],
        filename="notes.txt",
        mime_type="text/plain",
        content=b"Session-scoped reference notes",
    )
    path = document_file(created["id"], document["id"])

    assert path.exists()

    deleted = await session_service.delete_session(created["id"])

    assert deleted is True
    assert not path.exists()
    assert not (get_runtime_paths().sessions_dir / created["id"]).exists()


@pytest.mark.asyncio
async def test_update_session_state():
    created = await session_service.create_session(SessionCreate(topic="Update test"))
    updated = await session_service.update_session_state(
        created["id"],
        current_turn=2,
        status="in_progress",
    )
    assert updated["current_turn"] == 2
    assert updated["status"] == "in_progress"


@pytest.mark.asyncio
async def test_get_session_flattens_shared_knowledge():
    created = await session_service.create_session(
        SessionCreate(topic="Shared knowledge"),
    )
    expected_shared_knowledge = [
        {"type": "fact", "query": "example", "result": "result"},
        {"type": "memo", "role": "proposer", "content": "summary"},
    ]

    updated = await session_service.update_session_state(
        created["id"],
        state_snapshot={
            "dialogue_history": [],
            "shared_knowledge": expected_shared_knowledge,
            "current_scores": {},
            "cumulative_scores": {},
            "agent_configs": {},
        },
    )

    assert updated is not None
    assert updated["shared_knowledge"] == expected_shared_knowledge

    fetched = await session_service.get_session(created["id"])

    assert fetched is not None
    assert fetched["shared_knowledge"] == expected_shared_knowledge


@pytest.mark.asyncio
async def test_get_session_merges_judge_history_into_dialogue_timeline():
    created = await session_service.create_session(
        SessionCreate(topic="Judge timeline"),
    )

    await session_service.update_session_state(
        created["id"],
        state_snapshot={
            "dialogue_history": [
                {
                    "role": "proposer",
                    "agent_name": "Proposer",
                    "content": "开场陈词",
                    "citations": [],
                    "timestamp": "2026-03-17T00:00:00Z",
                },
                {
                    "role": "opposer",
                    "agent_name": "Opposer",
                    "content": "反方回应",
                    "citations": [],
                    "timestamp": "2026-03-17T00:00:03Z",
                },
            ],
            "judge_history": [
                {
                    "role": "judge",
                    "target_role": "proposer",
                    "agent_name": "裁判组视角",
                    "content": "正方点评",
                    "scores": {},
                    "citations": [],
                    "timestamp": "2026-03-17T00:00:01Z",
                },
                {
                    "role": "judge",
                    "target_role": "opposer",
                    "agent_name": "裁判组视角",
                    "content": "反方点评",
                    "scores": {},
                    "citations": [],
                    "timestamp": "2026-03-17T00:00:04Z",
                },
            ],
            "shared_knowledge": [],
            "current_scores": {},
            "cumulative_scores": {},
            "agent_configs": {},
        },
    )

    fetched = await session_service.get_session(created["id"])
    assert fetched is not None

    roles = [item["role"] for item in fetched["dialogue_history"]]
    assert roles == ["proposer", "judge", "opposer", "judge"]
    assert fetched["dialogue_history"][1]["content"] == "正方点评"


@pytest.mark.asyncio
async def test_get_session_sanitizes_malformed_sse_dialogue_history():
    created = await session_service.create_session(
        SessionCreate(topic="Malformed provider payload"),
    )

    raw_sse = "\n\n".join(
        [
            'data: {"choices":[{"delta":{"role":"assistant","content":""},"index":0}]}',
            'data: {"choices":[{"delta":{"content":"Recovered "},"index":0}]}',
            'data: {"choices":[{"delta":{"content":"speech"},"index":0}]}',
            "data: [DONE]",
        ]
    )

    await session_service.update_session_state(
        created["id"],
        state_snapshot={
            "dialogue_history": [
                {
                    "role": "proposer",
                    "agent_name": "Proposer",
                    "content": raw_sse,
                    "citations": [],
                    "timestamp": "2026-03-17T00:00:00Z",
                }
            ],
            "shared_knowledge": [],
            "current_scores": {},
            "cumulative_scores": {},
            "agent_configs": {},
        },
    )

    fetched = await session_service.get_session(created["id"])

    assert fetched is not None
    assert fetched["dialogue_history"][0]["content"] == "Recovered speech"


@pytest.mark.asyncio
async def test_create_session_persists_provider_identity(monkeypatch):
    class _FakeAgentConfigService:
        async def build_session_agent_configs(self, agent_configs, participants):
            assert agent_configs == {"proposer": {"provider_id": "anthropic-team"}}
            assert participants == ["proposer"]
            return {
                "proposer": {
                    "provider_id": "anthropic-team",
                    "provider_type": "anthropic",
                    "model": "claude-3-7-sonnet",
                }
            }

    monkeypatch.setattr(
        session_service,
        "get_agent_config_service",
        lambda: _FakeAgentConfigService(),
    )

    created = await session_service.create_session(
        SessionCreate(
            topic="Provider identity",
            participants=["proposer"],
            agent_configs={"proposer": {"provider_id": "anthropic-team"}},
        ),
    )

    assert created["agent_configs"]["proposer"]["provider_id"] == "anthropic-team"
    assert created["agent_configs"]["proposer"]["provider_type"] == "anthropic"


@pytest.mark.asyncio
async def test_create_session_persists_team_config():
    created = await session_service.create_session(
        SessionCreate(
            topic="Team config",
            team_config={"agents_per_team": 4, "discussion_rounds": 3},
        ),
    )

    assert created["team_config"] == {"agents_per_team": 4, "discussion_rounds": 3}


@pytest.mark.asyncio
async def test_create_session_persists_jury_and_reasoning_config():
    created = await session_service.create_session(
        SessionCreate(
            topic="Jury config",
            jury_config={"agents_per_jury": 5, "discussion_rounds": 2},
            reasoning_config={
                "steelman_enabled": False,
                "counterfactual_enabled": True,
                "consensus_enabled": False,
            },
        ),
    )

    assert created["jury_config"] == {"agents_per_jury": 5, "discussion_rounds": 2}
    assert created["reasoning_config"] == {
        "steelman_enabled": False,
        "counterfactual_enabled": True,
        "consensus_enabled": False,
    }


@pytest.mark.asyncio
async def test_create_sophistry_session_enforces_mode_specific_defaults():
    created = await session_service.create_session(
        SessionCreate(
            topic="Sophistry mode",
            debate_mode="sophistry_experiment",
            team_config={"agents_per_team": 4, "discussion_rounds": 2},
            jury_config={"agents_per_jury": 3, "discussion_rounds": 2},
            reasoning_config={
                "steelman_enabled": True,
                "counterfactual_enabled": True,
                "consensus_enabled": True,
            },
        ),
    )

    assert created["debate_mode"] == "sophistry_experiment"
    assert created["mode_config"] == {
        "seed_reference_enabled": True,
        "observer_enabled": True,
        "artifact_detail_level": "full",
    }
    assert created["team_config"] == {"agents_per_team": 0, "discussion_rounds": 0}
    assert created["jury_config"] == {"agents_per_jury": 0, "discussion_rounds": 0}
    assert created["reasoning_config"] == {
        "steelman_enabled": False,
        "counterfactual_enabled": False,
        "consensus_enabled": False,
    }


@pytest.mark.asyncio
async def test_update_session_state_writes_round_json_file():
    created = await session_service.create_session(
        SessionCreate(topic="Round file export"),
    )

    await session_service.update_session_state(
        created["id"],
        current_turn=1,
        status="in_progress",
        state_snapshot={
            "dialogue_history": [
                {
                    "role": "proposer",
                    "agent_name": "Proposer",
                    "content": "Round one proposer",
                    "citations": [],
                    "timestamp": "2026-03-20T10:00:00Z",
                    "turn": 0,
                },
                {
                    "role": "opposer",
                    "agent_name": "Opposer",
                    "content": "Round one opposer",
                    "citations": [],
                    "timestamp": "2026-03-20T10:00:10Z",
                    "turn": 0,
                },
            ],
            "team_dialogue_history": [
                {
                    "role": "team_summary",
                    "agent_name": "Team Summary",
                    "content": "Internal summary",
                    "citations": [],
                    "timestamp": "2026-03-20T09:59:50Z",
                    "turn": 0,
                    "discussion_kind": "team",
                }
            ],
            "jury_dialogue_history": [
                {
                    "role": "jury_summary",
                    "agent_name": "Jury Summary",
                    "content": "Jury summary",
                    "citations": [],
                    "timestamp": "2026-03-20T10:00:20Z",
                    "turn": 0,
                    "discussion_kind": "jury",
                }
            ],
            "judge_history": [
                {
                    "role": "judge",
                    "target_role": "proposer",
                    "agent_name": "Judge",
                    "content": "Strong opening",
                    "scores": {"logical_rigor": {"score": 8, "rationale": "Clear"}},
                    "timestamp": "2026-03-20T10:00:30Z",
                    "citations": [],
                    "turn": 0,
                }
            ],
            "shared_knowledge": [
                {
                    "type": "fact",
                    "query": "example",
                    "result": "result",
                    "source_turn": 0,
                }
            ],
            "current_scores": {},
            "cumulative_scores": {},
            "agent_configs": {},
        },
    )

    round_path = get_runtime_paths().sessions_dir / created["id"] / "rounds" / "round-001.json"
    assert round_path.exists()

    round_payload = json.loads(round_path.read_text(encoding="utf-8"))
    assert round_payload["turn"] == 0
    assert round_payload["turn_number"] == 1
    assert [entry["role"] for entry in round_payload["debate"]] == ["proposer", "opposer"]
    assert round_payload["judge"][0]["target_role"] == "proposer"
    assert round_payload["shared_knowledge"][0]["query"] == "example"
