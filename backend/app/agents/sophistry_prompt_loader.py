"""Prompt loader for the standalone sophistry experiment mode."""

from __future__ import annotations

import logging

from app.config import get_settings

logger = logging.getLogger(__name__)


def _load_prompt(filename: str) -> str:
    path = get_settings().prompt_path(f"sophistry/{filename}")
    if not path.exists():
        logger.warning("Sophistry prompt file not found: %s", path)
        return ""
    return path.read_text(encoding="utf-8")


def get_sophistry_debater_system_prompt(role: str) -> str:
    base = _load_prompt("debater_system.md")

    role_file = f"debater_{role}.md"
    supplement = _load_prompt(role_file)
    if not supplement:
        if role.startswith("proposer"):
            supplement = _load_prompt("debater_proposer.md")
        elif role.startswith("opposer"):
            supplement = _load_prompt("debater_opposer.md")

    if supplement:
        return f"{base}\n\n---\n\n{supplement}"
    return base


def get_sophistry_observer_prompt() -> str:
    return _load_prompt("observer_system.md")
