"""
LLM client factory - RE-EXPORT for backward compatibility.

This module has been moved to app.llm.config. This file is kept as a
backward-compat re-export and should not be used for new code.
"""

from app.llm.config import (
    DEFAULT_MAX_TOKENS,
    ResolvedLLMConfig,
    create_llm,
    create_llm_from_config,
    get_llm,
    resolve_llm_config,
)

__all__ = [
    "DEFAULT_MAX_TOKENS",
    "ResolvedLLMConfig",
    "resolve_llm_config",
    "create_llm_from_config",
    "create_llm",
    "get_llm",
]
