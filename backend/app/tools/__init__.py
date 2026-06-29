"""Agent tool entrypoints."""

from langchain_core.tools import BaseTool

from app.tools.search_tool import web_search

# Registry mapping tool names to their LangChain Tool instances
_SKILL_REGISTRY = {
    "web_search": web_search,
}


def get_all_skills() -> list[BaseTool]:
    """Retrieve all registered tools."""
    return list(_SKILL_REGISTRY.values())


__all__ = ["get_all_skills", "web_search"]
