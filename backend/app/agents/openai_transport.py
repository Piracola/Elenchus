"""Backward-compatible alias for ``app.llm.transport``.

Recommended entrypoint:
- New backend code should import the OpenAI-compatible transport from
  ``app.llm.transport``.

Compatibility contract:
- ``app.agents.openai_transport`` remains importable for older code only.
"""

import sys

from app.llm import transport as _transport_module

sys.modules[__name__] = _transport_module
