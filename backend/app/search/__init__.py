"""Search providers package."""

from app.search.base import SearchProvider, SearchResult
from app.search.searxng import SearXNGProvider
from app.search.tavily import TavilyProvider
from app.search.factory import SearchProviderFactory
