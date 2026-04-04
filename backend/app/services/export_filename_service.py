from __future__ import annotations

import re
from typing import Any
from urllib.parse import quote

_INVALID_FILENAME_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1F]')
_WINDOWS_RESERVED_NAMES = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    "COM1",
    "COM2",
    "COM3",
    "COM4",
    "COM5",
    "COM6",
    "COM7",
    "COM8",
    "COM9",
    "LPT1",
    "LPT2",
    "LPT3",
    "LPT4",
    "LPT5",
    "LPT6",
    "LPT7",
    "LPT8",
    "LPT9",
}
_MAX_FILENAME_BASE_LENGTH = 120


def sanitize_filename_base(raw: Any) -> str:
    text = str(raw or "").strip()
    if not text:
        return "未命名辩题"

    sanitized = _INVALID_FILENAME_CHARS.sub("_", text)
    sanitized = re.sub(r"\s+", " ", sanitized).strip().rstrip(". ")
    if not sanitized:
        sanitized = "未命名辩题"

    if sanitized.upper() in _WINDOWS_RESERVED_NAMES:
        sanitized = f"{sanitized}_"

    if len(sanitized) > _MAX_FILENAME_BASE_LENGTH:
        sanitized = sanitized[:_MAX_FILENAME_BASE_LENGTH].rstrip(". ")

    return sanitized or "未命名辩题"


def build_export_filename(session_data: dict[str, Any], extension: str) -> str:
    base = sanitize_filename_base(session_data.get("topic"))
    normalized_extension = extension.lstrip(".") or "txt"
    return f"{base}.{normalized_extension}"


def build_content_disposition(filename: str) -> str:
    fallback = filename.encode("ascii", "ignore").decode("ascii").strip()
    fallback_base = fallback.rsplit(".", 1)[0].strip(". ") if "." in fallback else fallback.strip(". ")
    if not fallback_base:
        extension = filename.rsplit(".", 1)[-1] if "." in filename else "txt"
        fallback = f"debate-export.{extension}"
    return f'attachment; filename="{fallback}"; filename*=UTF-8\'\'{quote(filename)}'
