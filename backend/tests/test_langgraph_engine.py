"""Tests for LangGraph engine runtime configuration."""

from __future__ import annotations

import app.agents.graph as standard_graph_module
import app.agents.sophistry_graph as sophistry_graph_module

from app.runtime.engines.langgraph import LangGraphDebateEngine


class _FakeGraph:
    def __init__(self) -> None:
        self.calls: list[tuple[dict, dict, str | None]] = []

    def astream(self, state, config=None, stream_mode=None):
        self.calls.append((state, config or {}, stream_mode))

        async def _iter():
            if False:
                yield {}

        return _iter()


def test_engine_sets_recursion_limit_based_on_session_scale():
    fake_graph = _FakeGraph()
    engine = LangGraphDebateEngine(graph_factory=lambda: fake_graph)

    iterator = engine.stream(
        {
            "participants": ["proposer", "opposer"],
            "max_turns": 8,
        }
    )

    # Ensure we created an async iterator and passed graph config.
    assert iterator is not None
    assert len(fake_graph.calls) == 1

    _, config, stream_mode = fake_graph.calls[0]
    assert stream_mode == "values"
    assert isinstance(config.get("recursion_limit"), int)
    assert config["recursion_limit"] >= 100


def test_engine_selects_sophistry_graph_by_mode(monkeypatch):
    fake_standard_graph = _FakeGraph()
    fake_sophistry_graph = _FakeGraph()

    monkeypatch.setattr(
        standard_graph_module,
        "compile_debate_graph",
        lambda: fake_standard_graph,
    )
    monkeypatch.setattr(
        sophistry_graph_module,
        "compile_sophistry_graph",
        lambda: fake_sophistry_graph,
    )

    engine = LangGraphDebateEngine()
    engine.stream(
        {
            "debate_mode": "sophistry_experiment",
            "participants": ["proposer", "opposer"],
            "max_turns": 4,
        }
    )

    assert len(fake_sophistry_graph.calls) == 1
    assert fake_standard_graph.calls == []
