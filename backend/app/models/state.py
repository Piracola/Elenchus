"""
LangGraph GraphState — reusable Pydantic models for dialogue entries.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, TypedDict
from pydantic import BaseModel, Field


class DialogueEntry(BaseModel):
    """A single turn in the dialogue history."""

    role: str = Field(..., description="Speaker identifier, e.g. 'proposer', 'opposer', 'system'")
    agent_name: str = Field(default="", description="Display name of the agent")
    content: str = Field(..., description="The spoken content")
    citations: list[str] = Field(default_factory=list, description="URLs or references cited")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


DialogueRole = Literal[
    'proposer',
    'opposer',
    'judge',
    'system',
    'error',
    'audience',
    'fact_checker',
    'team_member',
    'team_summary',
    'jury_member',
    'jury_summary',
    'consensus_summary',
]


class DialogueEntryDict(TypedDict, total=False):
    """TypedDict for dialogue history entries in LangGraph state."""
    role: DialogueRole
    agent_name: str
    content: str
    citations: list[str]
    timestamp: str
    turn: int | None
    target_role: str | None
    scores: dict | None
    discussion_kind: str | None
    team_side: str | None
    team_round: int | None
    team_member_index: int | None
    team_specialty: str | None
    jury_round: int | None
    jury_member_index: int | None
    jury_perspective: str | None
    source_role: str | None


class SharedKnowledgeEntry(TypedDict, total=False):
    """TypedDict for shared knowledge entries."""
    type: Literal[
        'fact',
        'memo',
        'context',
        'reference_summary',
        'reference_term',
        'reference_claim',
        'reference_excerpt',
        'reference_validation',
    ]
    query: str
    result: str
    timestamp: str | None
    role: str
    agent_name: str
    content: str
    title: str
    document_id: str
    document_name: str
    validation_status: str
    source_timestamp: str
    source_role: str
    source_agent_name: str
    source_excerpt: str
    source_kind: str
    source_turn: int
