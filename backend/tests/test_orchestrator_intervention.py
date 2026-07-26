"""Moderator directive injection, re-entry, and interrupt behaviour."""

from __future__ import annotations

import pytest

from app.models.schemas import RunCommandType, SessionCreate
from app.runtime.orchestrator import DebateOrchestrator
from app.services import run_service, session_service


class _RecordingRepository:
    def __init__(self, initial_state: dict) -> None:
        self._initial_state = initial_state
        self.persisted: list[dict] = []

    async def build_initial_state(self, run_id, session_id, **kwargs):
        state = dict(self._initial_state)
        state["run_id"] = run_id
        state["session_id"] = session_id
        return state

    async def persist_state(self, run_id, session_id, state):
        self.persisted.append(dict(state))

    async def get_session_for_run(self, run_id):
        return {"id": "session", "topic": "T"}


class _ScriptedEngine:
    """Yields a fixed sequence of node snapshots per stream invocation."""

    def __init__(self, scripts: list[list[dict]]) -> None:
        self._scripts = scripts
        self.stream_inputs: list[dict] = []

    def stream(self, initial_state):
        self.stream_inputs.append(dict(initial_state))
        index = min(len(self.stream_inputs) - 1, len(self._scripts) - 1)
        snapshots = self._scripts[index]
        base = dict(initial_state)

        async def _generate():
            for snapshot in snapshots:
                merged = {**base, **snapshot}
                yield merged

        return _generate()


async def _make_run(topic: str = "Directive topic") -> tuple[str, str]:
    session = await session_service.create_session(SessionCreate(topic=topic))
    created = await run_service.create_run(
        session["id"],
        topic=session["topic"],
        participants=session["participants"],
        max_turns=session["max_turns"],
        agent_configs={},
    )
    return created["run"]["id"], session["id"]


def _base_state(run_id: str, session_id: str) -> dict:
    return {
        "run_id": run_id,
        "session_id": session_id,
        "topic": "Directive topic",
        "participants": ["proposer", "opposer"],
        "max_turns": 2,
        "current_turn": 0,
        "dialogue_history": [],
        "shared_knowledge": [],
        "agent_configs": {},
        "last_executed_node": "",
    }


@pytest.mark.asyncio
async def test_pending_directive_is_injected_before_first_stream(db_session):
    run_id, session_id = await _make_run()
    await run_service.record_command(
        run_id=run_id,
        session_id=session_id,
        command_type=RunCommandType.INTERVENE,
        payload={"content": "请回应经济学证据"},
    )

    repository = _RecordingRepository(_base_state(run_id, session_id))
    engine = _ScriptedEngine([[{"last_executed_node": "advance_turn", "current_turn": 1}]])
    orchestrator = DebateOrchestrator(repository=repository, engine=engine)

    await orchestrator.run_debate(
        run_id=run_id,
        session_id=session_id,
        topic="Directive topic",
        participants=["proposer", "opposer"],
        max_turns=2,
    )

    injected = engine.stream_inputs[0]["dialogue_history"]
    assert len(injected) == 1
    assert injected[0]["role"] == "audience"
    assert injected[0]["agent_name"] == "主持人"
    assert injected[0]["content"] == "请回应经济学证据"
    # Consumed commands must not be replayed.
    assert await run_service.list_pending_commands(run_id) == []


@pytest.mark.asyncio
async def test_directive_arriving_mid_run_triggers_reentry(db_session):
    run_id, session_id = await _make_run()
    repository = _RecordingRepository(_base_state(run_id, session_id))

    class _EngineWithMidRunDirective(_ScriptedEngine):
        def stream(self, initial_state):
            self.stream_inputs.append(dict(initial_state))
            is_first_pass = len(self.stream_inputs) == 1
            base = dict(initial_state)

            async def _generate():
                if is_first_pass:
                    yield {**base, "last_executed_node": "speaker", "current_speaker": "proposer"}
                    # A directive lands while the graph is mid-turn.
                    await run_service.record_command(
                        run_id=run_id,
                        session_id=session_id,
                        command_type=RunCommandType.INTERVENE,
                        payload={"content": "请聚焦于可验证的数据"},
                    )
                    yield {**base, "last_executed_node": "judge"}
                else:
                    yield {**base, "last_executed_node": "advance_turn", "current_turn": 1}

            return _generate()

    engine = _EngineWithMidRunDirective([[]])
    orchestrator = DebateOrchestrator(repository=repository, engine=engine)

    await orchestrator.run_debate(
        run_id=run_id,
        session_id=session_id,
        topic="Directive topic",
        participants=["proposer", "opposer"],
        max_turns=2,
    )

    # The graph restarted once with the directive present in state.
    assert len(engine.stream_inputs) == 2
    second_history = engine.stream_inputs[1]["dialogue_history"]
    assert any(entry.get("content") == "请聚焦于可验证的数据" for entry in second_history)
    # Resume routing points back at the interrupted portion of the turn.
    assert engine.stream_inputs[1].get("resume_next_node") == "advance_turn"


@pytest.mark.asyncio
async def test_directive_injection_is_idempotent_across_reentries(db_session):
    run_id, session_id = await _make_run()
    state = _base_state(run_id, session_id)
    repository = _RecordingRepository(state)
    engine = _ScriptedEngine([[{"last_executed_node": "advance_turn"}]])
    orchestrator = DebateOrchestrator(repository=repository, engine=engine)

    command = await run_service.record_command(
        run_id=run_id,
        session_id=session_id,
        command_type=RunCommandType.INTERVENE,
        payload={"content": "只此一条"},
    )
    run_events = orchestrator._events.for_run(run_id)

    injected_first = await orchestrator._inject_pending_interventions(
        run_id, session_id, state, run_events
    )
    assert len(injected_first) == 1
    assert injected_first[0]["event_id"] == command["id"]

    # Re-running with the same state must not duplicate the entry even if the
    # command somehow reappears as pending.
    await run_service.record_command(
        run_id=run_id,
        session_id=session_id,
        command_type=RunCommandType.INTERVENE,
        payload={"content": "第二条"},
    )
    injected_second = await orchestrator._inject_pending_interventions(
        run_id, session_id, state, run_events
    )
    assert [entry["content"] for entry in injected_second] == ["第二条"]
    assert len(state["dialogue_history"]) == 2


@pytest.mark.asyncio
async def test_revoked_directive_is_never_injected(db_session):
    run_id, session_id = await _make_run()
    command = await run_service.record_command(
        run_id=run_id,
        session_id=session_id,
        command_type=RunCommandType.INTERVENE,
        payload={"content": "撤回这条"},
    )

    assert await run_service.revoke_command(run_id, command["id"]) is True
    assert await run_service.list_pending_commands(run_id) == []
    # A second revoke is a no-op rather than an error.
    assert await run_service.revoke_command(run_id, command["id"]) is False


@pytest.mark.asyncio
async def test_consume_pending_interventions_claims_once(db_session):
    run_id, session_id = await _make_run()
    for content in ("一", "二"):
        await run_service.record_command(
            run_id=run_id,
            session_id=session_id,
            command_type=RunCommandType.INTERVENE,
            payload={"content": content},
        )

    first = await run_service.consume_pending_interventions(run_id)
    second = await run_service.consume_pending_interventions(run_id)

    assert [item["payload"]["content"] for item in first] == ["一", "二"]
    assert second == []
