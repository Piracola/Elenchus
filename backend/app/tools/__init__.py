"""Agent tools (formerly app.agents.skills package)."""

from langchain_core.tools import BaseTool

from app.tools.search_tool import web_search

# Registry mapping tool names to their LangChain Tool instances
_SKILL_REGISTRY = {
    "web_search": web_search,
}


def get_all_skills() -> list[BaseTool]:
    """Retrieve all available tools."""
    return list(_SKILL_REGISTRY.values())
