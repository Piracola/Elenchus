"""Bridge between a debate session and the local video renderer tool.

The renderer (``video/``) is a separate Node + Remotion + Edge TTS toolchain
with its own local HTTP console. Rendering is not run inside this process:
the portable Windows build ships no Node runtime, and the renderer already
owns task queueing, TTS caching, and artifact validation. This service only
hands the exported session JSON over to that console.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any

import httpx

from app.services.export import export_json

logger = logging.getLogger(__name__)

DEFAULT_VIDEO_BASE_URL = "http://127.0.0.1:4317"
_IMPORT_TIMEOUT_SECONDS = 20.0


class VideoToolUnavailableError(RuntimeError):
    """Raised when the local video renderer console is not reachable."""


@dataclass(frozen=True)
class VideoHandoffResult:
    video_ui_url: str
    topic: str
    speech_count: int
    warnings: list[str]


def _resolve_base_url() -> str:
    try:
        from app.runtime_config_store import read_runtime_section

        section = read_runtime_section("video")
        if isinstance(section, dict):
            base_url = str(section.get("base_url", "") or "").strip()
            if base_url:
                return base_url.rstrip("/")
    except Exception:  # pragma: no cover - defensive
        logger.warning("Failed to read video config; using default base URL", exc_info=True)
    return DEFAULT_VIDEO_BASE_URL


def collect_handoff_warnings(payload: dict[str, Any]) -> list[str]:
    """Flag session traits the renderer cannot represent."""
    warnings: list[str] = []
    if str(payload.get("debate_mode", "") or "") == "sophistry_experiment":
        warnings.append(
            "诡辩实验模式的观察员报告不会出现在视频中，仅渲染辩手发言。"
        )
    dialogue = payload.get("dialogue_history")
    if not isinstance(dialogue, list) or not dialogue:
        warnings.append("这场辩论还没有任何发言，视频内容会是空的。")
    return warnings


def _count_speeches(payload: dict[str, Any]) -> int:
    participants = {str(role) for role in (payload.get("participants") or [])}
    dialogue = payload.get("dialogue_history")
    if not isinstance(dialogue, list):
        return 0
    return sum(
        1
        for entry in dialogue
        if isinstance(entry, dict) and str(entry.get("role", "") or "") in participants
    )


async def send_session_to_video_tool(payload: dict[str, Any]) -> VideoHandoffResult:
    """Push the exported session into the renderer console's import endpoint."""
    base_url = _resolve_base_url()
    # Reuse the exact JSON export the renderer already knows how to parse.
    body = json.loads(export_json(payload))

    try:
        async with httpx.AsyncClient(timeout=_IMPORT_TIMEOUT_SECONDS) as client:
            response = await client.post(f"{base_url}/api/import", json=body)
    except httpx.HTTPError as exc:
        raise VideoToolUnavailableError(
            "无法连接本地视频生成器（"
            f"{base_url}）。请先运行 video/启动视频生成器.bat 再重试。"
        ) from exc

    if response.status_code >= 400:
        detail = response.text[:300]
        raise VideoToolUnavailableError(
            f"视频生成器拒绝了本次导入（HTTP {response.status_code}）：{detail}"
        )

    return VideoHandoffResult(
        video_ui_url=base_url,
        topic=str(payload.get("topic", "") or ""),
        speech_count=_count_speeches(payload),
        warnings=collect_handoff_warnings(payload),
    )
