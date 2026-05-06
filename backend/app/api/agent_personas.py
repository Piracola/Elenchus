"""Agent persona library API."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models.schemas import AgentPersonaDetail, AgentPersonaSummary
from app.services.agent_persona_service import AgentPersonaService

router = APIRouter(prefix="/agent-personas", tags=["agent-personas"])


@router.get("", response_model=list[AgentPersonaSummary])
async def list_agent_personas():
    """List persona files available under runtime/agent_personas."""
    return AgentPersonaService().list_personas()


@router.get("/{persona_id}", response_model=AgentPersonaDetail)
async def get_agent_persona(persona_id: str):
    """Return one persona file, including its prompt content."""
    persona = AgentPersonaService().get_persona(persona_id)
    if persona is None:
        raise HTTPException(status_code=404, detail="Agent persona not found")
    return persona
