"""Helpers for per-role debate speech length guidance."""

from __future__ import annotations

from typing import Any

ROLE_LIMIT_KEYS = {
    "proposer": "proposer_max_chars",
    "opposer": "opposer_max_chars",
    "group_discussion": "group_discussion_max_chars",
}


def get_role_speech_limit_chars(speech_config: Any, role: str) -> int | None:
    """Return a positive visible character limit for a debate role."""
    if not isinstance(speech_config, dict):
        return None

    key = ROLE_LIMIT_KEYS.get(role)
    if key is None:
        return None

    try:
        limit = int(speech_config.get(key, 0) or 0)
    except (TypeError, ValueError):
        return None

    return limit if limit > 0 else None


def build_speech_limit_instruction(limit_chars: int | None) -> str:
    """Build prompt text that asks the debater to keep the visible speech concise."""
    if limit_chars is None:
        return ""

    return (
        "## 发言长度限制\n"
        f"本轮公开发言正文请控制在 {limit_chars} 个中文字符以内。"
        "优先保留核心论点、关键反驳和明确结论；不要为了凑长度展开铺陈。"
    )
