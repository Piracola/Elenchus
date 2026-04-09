"""
Safe model invocation helpers - RE-EXPORT for backward compatibility.

This module has been moved to app.llm.invoke. This file is kept as a
backward-compat re-export and should not be used for new code.
"""

from app.llm.invoke import (
    _coerce_openai_response_to_ai_message,
    extract_text_content,
    invoke_chat_model,
    invoke_text_model,
    normalize_model_text,
)

__all__ = [
    "extract_text_content",
    "invoke_chat_model",
    "invoke_text_model",
    "normalize_model_text",
    "_coerce_openai_response_to_ai_message",
]
