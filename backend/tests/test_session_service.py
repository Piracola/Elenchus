"""
Smoke tests for session CRUD operations.
"""

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import session_service
from app.models.schemas import SessionCreate


@pytest.mark.asyncio
async def test_create_session(db_session: AsyncSession):
    body = SessionCreate(topic="AI will replace programmers", max_turns=3)
    result = await session_service.create_session(db_session, body)

    assert result["topic"] == "AI will replace programmers"
    assert result["max_turns"] == 3
    assert result["status"] == "pending"
    assert result["current_turn"] == 0
    assert len(result["id"]) == 12


@pytest.mark.asyncio
async def test_list_sessions_empty(db_session: AsyncSession):
    items = await session_service.list_sessions(db_session)
    assert items == []


@pytest.mark.asyncio
async def test_list_sessions_pagination(db_session: AsyncSession):
    for i in range(5):
        await session_service.create_session(db_session, SessionCreate(topic=f"Topic {i}"))

    page1 = await session_service.list_sessions(db_session, offset=0, limit=3)
    page2 = await session_service.list_sessions(db_session, offset=3, limit=3)

    assert len(page1) == 3
    assert len(page2) == 2
    total = await session_service.count_sessions(db_session)
    assert total == 5


@pytest.mark.asyncio
async def test_get_session(db_session: AsyncSession):
    created = await session_service.create_session(db_session, SessionCreate(topic="Test"))
    fetched = await session_service.get_session(db_session, created["id"])

    assert fetched is not None
    assert fetched["id"] == created["id"]


@pytest.mark.asyncio
async def test_get_session_not_found(db_session: AsyncSession):
    result = await session_service.get_session(db_session, "nonexistent1")
    assert result is None


@pytest.mark.asyncio
async def test_delete_session(db_session: AsyncSession):
    created = await session_service.create_session(db_session, SessionCreate(topic="Delete me"))
    deleted = await session_service.delete_session(db_session, created["id"])
    assert deleted is True

    fetched = await session_service.get_session(db_session, created["id"])
    assert fetched is None


@pytest.mark.asyncio
async def test_update_session_state(db_session: AsyncSession):
    created = await session_service.create_session(db_session, SessionCreate(topic="Update test"))
    updated = await session_service.update_session_state(
        db_session,
        created["id"],
        current_turn=2,
        status="in_progress",
    )
    assert updated["current_turn"] == 2
    assert updated["status"] == "in_progress"


@pytest.mark.asyncio
async def test_get_session_flattens_shared_knowledge(db_session: AsyncSession):
    created = await session_service.create_session(
        db_session,
        SessionCreate(topic="Shared knowledge"),
    )
    expected_shared_knowledge = [
        {"type": "fact", "query": "example", "result": "result"},
        {"type": "memo", "role": "proposer", "content": "summary"},
    ]

    updated = await session_service.update_session_state(
        db_session,
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

    fetched = await session_service.get_session(db_session, created["id"])

    assert fetched is not None
    assert fetched["shared_knowledge"] == expected_shared_knowledge


@pytest.mark.asyncio
async def test_get_session_sanitizes_malformed_sse_dialogue_history(db_session: AsyncSession):
    created = await session_service.create_session(
        db_session,
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
        db_session,
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

    fetched = await session_service.get_session(db_session, created["id"])

    assert fetched is not None
    assert fetched["dialogue_history"][0]["content"] == "Recovered speech"
