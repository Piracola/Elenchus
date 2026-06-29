"""
Abstract base class for search providers.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from pydantic import BaseModel


class SearchResult(BaseModel):
    """Unified search result across all providers."""

    title: str = ""
    url: str = ""
    snippet: str = ""
    source_engine: str = ""


class SearchProvider(ABC):
    """
    All search backends must implement this interface.
    The app intentionally keeps this surface small: DDGS plus one custom HTTP
    bridge for users who need an external service.
    """

    @abstractmethod
    async def search(self, query: str, num_results: int = 5) -> list[SearchResult]:
        """Execute a search and return structured results."""
        ...

    @abstractmethod
    async def is_available(self) -> bool:
        """Health check — can this provider serve requests right now?"""
        ...

    async def close(self) -> None:
        """Cleanup resources — optional, override if provider holds resources."""
        pass
