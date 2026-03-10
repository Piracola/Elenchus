"""
LangGraph GraphState — the single source of truth flowing through the debate graph.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field


class DialogueEntry(BaseModel):
    """A single turn in the dialogue history."""

    role: str = Field(..., description="Speaker identifier, e.g. 'proposer', 'opposer', 'system'")
    agent_name: str = Field(default="", description="Display name of the agent")
    content: str = Field(..., description="The spoken content")
    citations: list[str] = Field(default_factory=list, description="URLs or references cited")
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class SearchResult(BaseModel):
    """A single search result from the fact-checker."""

    title: str = ""
    url: str = ""
    snippet: str = ""
    source_engine: str = ""


class GraphState(BaseModel):
    """
    Core state that travels through every node in the LangGraph debate graph.
    """

    session_id: str = Field(default="", description="Unique session identifier")
    topic: str = Field(default="", description="The debate topic / thesis")
    participants: list[str] = Field(
        default_factory=lambda: ["proposer", "opposer"],
        description="Ordered list of participant role identifiers",
    )
    current_turn: int = Field(default=0)
    max_turns: int = Field(default=5)
    current_speaker: str = Field(default="", description="Role ID of the current speaker")

    dialogue_history: list[DialogueEntry] = Field(default_factory=list)
    context_summary: str = Field(
        default="",
        description="Compressed summary of older turns (context window management)",
    )
    search_context: list[SearchResult] = Field(
        default_factory=list,
        description="Search results for the current turn (visible to debaters & judge)",
    )

    current_scores: dict[str, Any] = Field(
        default_factory=dict,
        description="Scores for the current turn, keyed by participant role",
    )
    cumulative_scores: dict[str, Any] = Field(
        default_factory=dict,
        description="Accumulated scores across all turns, keyed by participant role",
    )

    status: str = Field(
        default="pending",
        description="Session status: pending | in_progress | completed | error",
    )
    error: str | None = Field(default=None)
