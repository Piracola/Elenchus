from typing import Sequence

from langchain_core.tools import BaseTool

from app.agents.skills.search import search_web

# Registry mapping skill names to their LangChain Tool instances
_SKILL_REGISTRY = {
    "search_web": search_web,
}

def get_all_skills() -> Sequence[BaseTool]:
    """Retrieve all available skills as LangChain tools."""
    return list(_SKILL_REGISTRY.values())

def get_skills_by_name(names: list[str]) -> Sequence[BaseTool]:
    """Retrieve specific skills by their registered name."""
    return [
        _SKILL_REGISTRY[name] 
        for name in names 
        if name in _SKILL_REGISTRY
    ]
