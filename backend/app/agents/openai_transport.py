"""
Raw OpenAI-compatible transport - RE-EXPORT for backward compatibility.

This module has been moved to app.llm.transport. This file is kept as a
backward-compat re-export and should not be used for new code.
"""

from app.llm.transport import (
    build_openai_chat_payload,
    invoke_openai_chat_raw,
    invoke_openai_chat_raw_streaming,
)

__all__ = [
    "build_openai_chat_payload",
    "invoke_openai_chat_raw",
    "invoke_openai_chat_raw_streaming",
]
