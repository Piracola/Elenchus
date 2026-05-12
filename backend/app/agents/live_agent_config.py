"""Helpers for reading the latest per-session agent config snapshot."""

from __future__ import annotations

from typing import Any

from app.services import session_service


async def refresh_agent_configs_for_session(state: dict[str, Any]) -> dict[str, Any]:
    """Return the latest persisted agent configs without mutating old transcript data."""
    session_id = str(state.get("session_id", "") or "")
    if not session_id:
        current = state.get("agent_configs", {})
        return current if isinstance(current, dict) else {}

    session = await session_service.get_session(session_id)
    if session is None:
        current = state.get("agent_configs", {})
        return current if isinstance(current, dict) else {}

    agent_configs = session.get("agent_configs", {})
    return agent_configs if isinstance(agent_configs, dict) else {}
