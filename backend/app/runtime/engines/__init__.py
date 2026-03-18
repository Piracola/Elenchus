"""Pluggable debate engine implementations."""

from app.runtime.engines.base import DebateEngine
from app.runtime.engines.langgraph import LangGraphDebateEngine

__all__ = ["DebateEngine", "LangGraphDebateEngine"]
