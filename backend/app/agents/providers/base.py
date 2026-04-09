"""
Base provider client - RE-EXPORT for backward compatibility.

This module has been moved to app.llm.providers.base. This file is kept as a
backward-compat re-export and should not be used for new code.
"""

from app.llm.providers.base import BaseProviderClient

__all__ = ["BaseProviderClient"]
