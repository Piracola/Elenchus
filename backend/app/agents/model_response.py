"""
Response normalization helpers - RE-EXPORT for backward compatibility.

This module has been moved to app.llm.response. This file is kept as a
backward-compat re-export and should not be used for new code.
"""

from app.llm.response import (
    _coerce_openai_response_to_ai_message,
    _looks_like_html_document,
    _provider_html_response_error,
    extract_text_content,
    normalize_model_text,
)

__all__ = [
    "extract_text_content",
    "normalize_model_text",
    "_coerce_openai_response_to_ai_message",
    "_looks_like_html_document",
    "_provider_html_response_error",
]
