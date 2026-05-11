"""Backward-compatible alias for ``app.tools.search_query_planner``.

Prefer importing query-planning helpers from ``app.tools.search_query_planner``.
"""

from app.tools import search_query_planner as _search_query_planner_module
import sys

sys.modules[__name__] = _search_query_planner_module
