from __future__ import annotations

from langchain_core.tools import BaseTool

_SHARED_KNOWLEDGE_TYPE = "shared_knowledge_type"


def mark_tool_shared_knowledge(tool: BaseTool, knowledge_type: str) -> BaseTool:
    """Annotate a tool so the graph can persist selected results as shared knowledge."""
    tool.metadata = {
        **(tool.metadata or {}),
        _SHARED_KNOWLEDGE_TYPE: knowledge_type,
    }
    return tool


def get_tool_shared_knowledge_type(tool: BaseTool) -> str | None:
    """Return the shared-knowledge type declared by a tool, if any."""
    value = (tool.metadata or {}).get(_SHARED_KNOWLEDGE_TYPE)
    return value if isinstance(value, str) and value else None
