"""Backward-compatible alias for ``app.tools.search_tool``.

Prefer importing the canonical tool from ``app.tools.search_tool``.
"""

from app.tools import search_tool as _search_tool_module
import sys

sys.modules[__name__] = _search_tool_module
