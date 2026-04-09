"""
Skills/tools registry - RE-EXPORT for backward compatibility.

This module has been moved to app.tools. This file is kept as a
backward-compat re-export and should not be used for new code.
"""

from app.tools import get_all_skills, web_search

__all__ = ["get_all_skills", "web_search"]
