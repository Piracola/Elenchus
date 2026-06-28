"""Helpers for validating model output before it becomes public speech."""

from __future__ import annotations

import re
from typing import Any

from app.llm.invoke import extract_text_content, normalize_model_text

_THINK_OPEN_RE = re.compile(r"^\s*<think\b[^>]*>", re.IGNORECASE)
_THINK_CLOSE_RE = re.compile(r"</think\s*>", re.IGNORECASE)

_TRANSPORT_FAILURE_PREFIXES = (
    "[Malformed provider",
    "[Provider endpoint returned HTML",
    "[Tool call response omitted]",
)


EMPTY_SPEECH_RETRY_INSTRUCTION = (
    "上一次模型回复没有产生可展示的正式辩论发言。"
    "现在请直接输出正式发言正文，不要只输出思考过程、<think> 内容、工具请求、"
    "搜索过程或占位说明。发言必须包含面向裁判和对方的完整论证。"
)


def normalize_response_content(response: Any) -> str:
    """Extract and normalize text from a chat model response."""
    response_content = response.content if hasattr(response, "content") else response
    return normalize_model_text(extract_text_content(response_content))


def visible_speech_text(content: str) -> str:
    """Return the part users see as speech after leading think blocks collapse."""
    remaining = content or ""

    while True:
        open_match = _THINK_OPEN_RE.match(remaining)
        if not open_match:
            return remaining.strip()

        after_open = open_match.end()
        close_match = _THINK_CLOSE_RE.search(remaining, after_open)
        if not close_match:
            return remaining.strip()

        remaining = remaining[close_match.end():]


def is_usable_speech_content(content: str) -> bool:
    """Reject empty, think-only, and transport-placeholder responses."""
    visible = visible_speech_text(content)
    if not visible:
        return False
    return not any(visible.startswith(prefix) for prefix in _TRANSPORT_FAILURE_PREFIXES)
