"""Canonical agent tool entrypoints.

New backend code should import from ``app.tools`` and ``app.tools.*``.
The mirrored ``app.agents.skills`` package is kept only as a backward-
compatibility shell for older imports.
"""

from langchain_core.tools import BaseTool

from app.tools.search_tool import web_search

# Registry mapping tool names to their LangChain Tool instances
_SKILL_REGISTRY = {
    "web_search": web_search,
}


def get_all_skills() -> list[BaseTool]:
    """Retrieve all registered tools from the canonical app.tools registry."""
    return list(_SKILL_REGISTRY.values())


__all__ = ["get_all_skills", "web_search"]
