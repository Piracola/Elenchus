"""Compatibility wrapper for the simplified debate runner."""

from __future__ import annotations

from typing import Any

from app.runtime.runner import DebateRunner


async def run_debate(
    session_id: str,
    topic: str,
    participants: list[str] | None = None,
    max_turns: int = 5,
    agent_configs: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Execute a debate using the default runtime runner.

    Kept for backward compatibility with existing scripts and tests.
    """
    orchestrator = DebateRunner()
    return await orchestrator.run_debate(
        session_id=session_id,
        topic=topic,
        participants=participants,
        max_turns=max_turns,
        agent_configs=agent_configs,
    )
