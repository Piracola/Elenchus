"""Backward-compatible alias for the canonical ``app.services.export`` package.

Recommended entrypoint:
- New backend code should import export helpers from ``app.services.export``.

Compatibility contract:
- ``app.services.export_service`` remains importable for older code only.
"""

import sys

from app.services import export as _export_module

sys.modules[__name__] = _export_module
