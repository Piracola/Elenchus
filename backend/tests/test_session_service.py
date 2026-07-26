"""Smoke tests for session CRUD operations."""

import pytest
from app.services import session_service
from app.services import document_service
from app.services import run_service
from app.models.schemas import SessionCreate


async def _create_run_for_session(session: dict) -> str:
    created = await run_service.create_run(
        session["id"],
        topic=session["topic"],
        participants=session["participants"],
        max_turns=session["max_turns"],
        agent_configs=session.get("agent_configs", {}),
    )
    return created["run"]["id"]


async def _update_run_state(
    run_id: str,
    state_snapshot: dict | None = None,
    *,
    current_turn: int | None = None,
    status: str | None = None,
) -> None:
    await run_service.update_run_state(
        run_id,
        current_turn=current_turn,
        status=status,
        state_snapshot=state_snapshot,
    )


@pytest.mark.asyncio
async def test_create_session():
    body = SessionCreate(topic="AI will replace programmers", max_turns=3)
    result = await session_service.create_session(body)

    assert result["topic"] == "AI will replace programmers"
    assert result["max_turns"] == 3
    assert result["status"] == "pending"
    assert result["current_turn"] == 0
    assert len(result["id"]) == 12
    assert result["reasoning_config"] == {
        "consensus_enabled": True,
        "group_discussion_rounds": 1,
        "fact_check_enabled": True,
    }
    assert result["speech_config"] == {
        "proposer_max_chars": 0,
        "opposer_max_chars": 0,
        "group_discussion_max_chars": 0,
    }


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
async def test_session_payload_exposes_latest_run_id():
    created = await session_service.create_session(SessionCreate(topic="Latest run"))
    run = await run_service.create_run(
        created["id"],
        topic=created["topic"],
        participants=created["participants"],
        max_turns=created["max_turns"],
        agent_configs=created.get("agent_configs", {}),
    )

    fetched = await session_service.get_session(created["id"])
    listed = await session_service.list_sessions()

    assert fetched is not None
    assert fetched["latest_run_id"] == run["run"]["id"]
    assert listed[0]["latest_run_id"] == run["run"]["id"]


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
    assert await document_service.get_session_document(created["id"], document["id"]) is not None

    deleted = await session_service.delete_session(created["id"])

    assert deleted is True
    assert await document_service.get_session_document(created["id"], document["id"]) is None


@pytest.mark.asyncio
async def test_update_run_state_updates_latest_session_summary():
    created = await session_service.create_session(SessionCreate(topic="Update test"))
    run_id = await _create_run_for_session(created)

    updated = await run_service.update_run_state(
        run_id,
        current_turn=2,
        status="in_progress",
    )
    fetched = await session_service.get_session(created["id"])
    assert updated is not None
    assert updated["current_turn"] == 2
    assert updated["status"] == "running"
    assert fetched is not None
    assert fetched["current_turn"] == 2
    assert fetched["status"] == "in_progress"


@pytest.mark.asyncio
async def test_get_session_flattens_shared_knowledge():
    created = await session_service.create_session(
        SessionCreate(topic="Shared knowledge"),
    )
    run_id = await _create_run_for_session(created)
    expected_shared_knowledge = [
        {"type": "fact", "query": "example", "result": "result"},
        {"type": "memo", "role": "proposer", "content": "summary"},
    ]

    await _update_run_state(
        run_id,
        state_snapshot={
            "dialogue_history": [],
            "shared_knowledge": expected_shared_knowledge,
            "current_scores": {},
            "cumulative_scores": {},
            "agent_configs": {},
        },
    )

    fetched = await session_service.get_session(created["id"])

    assert fetched is not None
    assert fetched["shared_knowledge"] == expected_shared_knowledge


@pytest.mark.asyncio
async def test_get_session_merges_judge_history_into_dialogue_timeline():
    created = await session_service.create_session(
        SessionCreate(topic="Judge timeline"),
    )
    run_id = await _create_run_for_session(created)

    await _update_run_state(
        run_id,
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
    run_id = await _create_run_for_session(created)

    raw_sse = "\n\n".join(
        [
            'data: {"choices":[{"delta":{"role":"assistant","content":""},"index":0}]}',
            'data: {"choices":[{"delta":{"content":"Recovered "},"index":0}]}',
            'data: {"choices":[{"delta":{"content":"speech"},"index":0}]}',
            "data: [DONE]",
        ]
    )

    await _update_run_state(
        run_id,
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
async def test_create_session_persists_reasoning_config():
    created = await session_service.create_session(
        SessionCreate(
            topic="Reasoning config",
            reasoning_config={
                "consensus_enabled": False,
                "group_discussion_rounds": 2,
            },
        ),
    )

    assert created["reasoning_config"] == {
        "consensus_enabled": False,
        "group_discussion_rounds": 2,
        "fact_check_enabled": True,
    }


@pytest.mark.asyncio
async def test_create_session_persists_speech_config():
    created = await session_service.create_session(
        SessionCreate(
            topic="Speech limits",
            speech_config={
                "proposer_max_chars": 900,
                "opposer_max_chars": 700,
                "group_discussion_max_chars": 500,
            },
        ),
    )

    assert created["speech_config"] == {
        "proposer_max_chars": 900,
        "opposer_max_chars": 700,
        "group_discussion_max_chars": 500,
    }

    fetched = await session_service.get_session(created["id"])
    assert fetched is not None
    assert fetched["speech_config"] == {
        "proposer_max_chars": 900,
        "opposer_max_chars": 700,
        "group_discussion_max_chars": 500,
    }


@pytest.mark.asyncio
async def test_create_session_updates_recent_debate_config():
    created = await session_service.create_session(
        SessionCreate(
            topic="Reusable setup",
            max_turns=7,
            agent_configs={
                "proposer": {
                    "provider_id": "openai-main",
                    "provider_type": "openai",
                    "model": "gpt-4.1",
                    "temperature": 0.4,
                }
            },
            reasoning_config={
                "consensus_enabled": False,
                "group_discussion_rounds": 2,
            },
            speech_config={
                "proposer_max_chars": 1200,
                "opposer_max_chars": 1000,
                "group_discussion_max_chars": 600,
            },
        ),
    )

    recent = await session_service.get_recent_debate_config()

    assert recent is not None
    assert recent["source_session_id"] == created["id"]
    assert recent["max_turns"] == 7
    assert recent["agent_configs"]["proposer"]["model"] == "gpt-4.1"
    assert recent["reasoning_config"] == {
        "consensus_enabled": False,
        "group_discussion_rounds": 2,
        "fact_check_enabled": True,
    }
    assert recent["speech_config"]["proposer_max_chars"] == 1200


@pytest.mark.asyncio
async def test_create_sophistry_session_enforces_mode_specific_defaults():
    created = await session_service.create_session(
        SessionCreate(
            topic="Sophistry mode",
            debate_mode="sophistry_experiment",
            reasoning_config={
                "consensus_enabled": True,
                "group_discussion_rounds": 3,
            },
        ),
    )

    assert created["debate_mode"] == "sophistry_experiment"
    assert created["mode_config"] == {
        "seed_reference_enabled": True,
        "observer_enabled": True,
        "artifact_detail_level": "full",
    }
    assert created["reasoning_config"] == {
        "consensus_enabled": False,
        "group_discussion_rounds": 0,
        "fact_check_enabled": False,
    }


@pytest.mark.asyncio
async def test_update_session_state_persists_projection_for_export():
    created = await session_service.create_session(
        SessionCreate(topic="Round file export"),
    )
    run_id = await _create_run_for_session(created)

    await _update_run_state(
        run_id,
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

    exported = await session_service.get_session(created["id"])

    assert exported is not None
    assert [entry["role"] for entry in exported["dialogue_history"]] == [
        "proposer",
        "opposer",
        "judge",
    ]
    assert exported["shared_knowledge"][0]["query"] == "example"
