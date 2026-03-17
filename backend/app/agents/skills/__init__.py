from typing import Sequence

from langchain_core.tools import BaseTool

from app.agents.skills.search_tool import web_search

# Registry mapping skill names to their LangChain Tool instances
_SKILL_REGISTRY = {
    "web_search": web_search,
}


def get_all_skills() -> Sequence[BaseTool]:
    """Retrieve all available skills as LangChain tools."""
    return list(_SKILL_REGISTRY.values())
