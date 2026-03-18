"""Tests for LangGraph engine runtime configuration."""

from __future__ import annotations

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
