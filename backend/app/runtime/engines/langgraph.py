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

        team_config = initial_state.get("team_config", {})
        agents_per_team = int(team_config.get("agents_per_team", 0) or 0)
        discussion_rounds = int(team_config.get("discussion_rounds", 0) or 0)
        team_multiplier = max(0, agents_per_team * discussion_rounds)
        jury_config = initial_state.get("jury_config", {})
        agents_per_jury = int(jury_config.get("agents_per_jury", 0) or 0)
        jury_rounds = int(jury_config.get("discussion_rounds", 0) or 0)
        jury_multiplier = max(0, agents_per_jury * jury_rounds)
        consensus_cost = 2 if bool((initial_state.get("reasoning_config", {}) or {}).get("consensus_enabled", True)) else 0

        # Worst-case estimate:
        # per turn ~= manage_context + each speaker with optional team discussion + up to 2 tool loops
        # + optional jury discussion + judge + advance_turn, plus an optional final consensus node.
        estimated_steps = max_turns * ((7 + team_multiplier) * len(participants) + 3 + jury_multiplier)
        estimated_steps += consensus_cost
        recursion_limit = max(100, estimated_steps + 20)

        return graph.astream(
            initial_state,
            {"recursion_limit": recursion_limit},
            stream_mode="values",
        )
