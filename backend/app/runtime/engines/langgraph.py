"""LangGraph-backed debate engine implementation."""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from typing import Any


class LangGraphDebateEngine:
    """Wrap the existing LangGraph workflow behind the DebateEngine contract."""

    def __init__(self, graph_factory: Callable[[], Any] | None = None) -> None:
        self._graph_factory = graph_factory

    def stream(self, initial_state: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
        graph_factory = self._graph_factory
        if graph_factory is None:
            from app.agents.graph import compile_debate_graph

            graph_factory = compile_debate_graph

        graph = graph_factory()
        participants = initial_state.get("participants", ["proposer", "opposer"])
        if not isinstance(participants, list) or not participants:
            participants = ["proposer", "opposer"]

        max_turns = initial_state.get("max_turns", 5)
        if not isinstance(max_turns, int) or max_turns <= 0:
            max_turns = 5

        # Worst-case estimate:
        # per turn ~= manage_context(1) + each speaker with up to 2 tool loops(6 * n) + judge(1) + advance_turn(1)
        estimated_steps = max_turns * (6 * len(participants) + 3)
        recursion_limit = max(100, estimated_steps + 20)

        return graph.astream(
            initial_state,
            {"recursion_limit": recursion_limit},
            stream_mode="values",
        )
