from __future__ import annotations

import json
from typing import Any

_JSON_EXPORT_INTERNAL_KEYS = {
    "agent_configs",
    "projection",
    "reasoning_config",
    "run_events",
    "shared_knowledge",
    "speech_config",
}


def _looks_like_session_export(session_data: dict[str, Any]) -> bool:
    return "dialogue_history" in session_data or "run_id" in session_data or "session_id" in session_data


def _compact_session_export(session_data: dict[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in session_data.items()
        if key not in _JSON_EXPORT_INTERNAL_KEYS
    }


def export_json(session_data: dict[str, Any]) -> str:
    payload = _compact_session_export(session_data) if _looks_like_session_export(session_data) else session_data
    return json.dumps(payload, ensure_ascii=False, indent=2, default=str)
