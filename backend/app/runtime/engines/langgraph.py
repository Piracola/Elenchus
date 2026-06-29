"""LangGraph-backed debate engine implementation."""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from typing import Any

from app.models.schemas import DebateMode


class LangGraphDebateEngine:
    """Wrap the existing LangGraph workflow behind the DebateEngine contract."""

    def __init__(self, graph_factory: Callable[[], Any] | None = None) -> None:
        self._graph_factory = graph_factory

    def stream(self, initial_state: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
        graph_factory = self._graph_factory
        debate_mode = str(
            initial_state.get("debate_mode", DebateMode.STANDARD.value)
            or DebateMode.STANDARD.value
        )
        if graph_factory is None:
            if debate_mode == DebateMode.SOPHISTRY_EXPERIMENT.value:
                from app.agents.sophistry_graph import compile_sophistry_graph

                graph_factory = compile_sophistry_graph
            else:
                from app.agents.graph import compile_debate_graph

                graph_factory = compile_debate_graph

        graph = graph_factory()
        participants = initial_state.get("participants", ["proposer", "opposer"])
        if not isinstance(participants, list) or not participants:
            participants = ["proposer", "opposer"]

        max_turns = initial_state.get("max_turns", 5)
        if not isinstance(max_turns, int) or max_turns <= 0:
            max_turns = 5

        consensus_cost = 2 if bool((initial_state.get("reasoning_config", {}) or {}).get("consensus_enabled", True)) else 0

        if debate_mode == DebateMode.SOPHISTRY_EXPERIMENT.value:
            estimated_steps = max_turns * (len(participants) + 4) + 4
        else:
            # Worst-case estimate:
            # per turn ~= manage_context + each speaker + up to 2 tool loops + judge + advance_turn,
            # plus an optional final consensus node.
            estimated_steps = max_turns * (7 * len(participants) + 3)
            estimated_steps += consensus_cost
        recursion_limit = max(100, estimated_steps + 20)

        return graph.astream(
            initial_state,
            {"recursion_limit": recursion_limit},
            stream_mode="values",
        )
