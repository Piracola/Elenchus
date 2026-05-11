"""Backward-compatible alias for ``app.tools.search_result_filter``.

Prefer importing result-filter helpers from ``app.tools.search_result_filter``.
"""

from app.tools import search_result_filter as _search_result_filter_module
import sys

sys.modules[__name__] = _search_result_filter_module
