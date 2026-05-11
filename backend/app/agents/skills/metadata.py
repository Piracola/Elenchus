"""Backward-compatible alias for ``app.tools.metadata``.

Prefer importing tool metadata helpers from ``app.tools.metadata`` in new code.
"""

from app.tools import metadata as _metadata_module
import sys

sys.modules[__name__] = _metadata_module
