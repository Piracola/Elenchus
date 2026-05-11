"""Backward-compatible alias for ``app.tools.search_formatter``.

Prefer importing formatting helpers from ``app.tools.search_formatter``.
"""

from app.tools import search_formatter as _search_formatter_module
import sys

sys.modules[__name__] = _search_formatter_module
