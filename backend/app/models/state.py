"""
LangGraph GraphState — reusable Pydantic models for dialogue entries.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal, TypedDict
from pydantic import BaseModel, Field


class DialogueEntry(BaseModel):
    """A single turn in the dialogue history."""

    role: str = Field(..., description="Speaker identifier, e.g. 'proposer', 'opposer', 'system'")
    agent_name: str = Field(default="", description="Display name of the agent")
    content: str = Field(..., description="The spoken content")
    citations: list[str] = Field(default_factory=list, description="URLs or references cited")
    timestamp: datetime = Field(default_factory=datetime.utcnow)


DialogueRole = Literal['proposer', 'opposer', 'judge', 'system', 'error', 'audience', 'fact_checker']


class DialogueEntryDict(TypedDict, total=False):
    """TypedDict for dialogue history entries in LangGraph state."""
    role: DialogueRole
    agent_name: str
    content: str
    citations: list[str]
    timestamp: str
    target_role: str | None
    scores: dict | None


class SharedKnowledgeEntry(TypedDict, total=False):
    """TypedDict for shared knowledge entries."""
    type: Literal['fact', 'memo', 'context']
    query: str
    result: str
    timestamp: str | None


class TurnScore(TypedDict, total=False):
    """TypedDict for turn scores."""
    score: float
    reasoning: str
    improvement_suggestions: list[str]


class RoleScores(TypedDict, total=False):
    """TypedDict for scores by dimension."""
    logic: TurnScore
    evidence: TurnScore
    relevance: TurnScore
    persuasion: TurnScore
    rebuttal: TurnScore
