from typing import Sequence

from langchain_core.tools import BaseTool

from app.agents.skills.searxng_tool import search_searxng
from app.agents.skills.tavily_tool import search_tavily

# Registry mapping skill names to their LangChain Tool instances
_SKILL_REGISTRY = {
    "search_searxng": search_searxng,
    "search_tavily": search_tavily,
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
