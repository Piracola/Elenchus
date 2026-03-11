"""
Prompt loader — reads system prompts from the prompts/ directory.
Supports hot-reloading (no cache) for development.
"""

from __future__ import annotations

import logging
from pathlib import Path

from app.config import get_settings

logger = logging.getLogger(__name__)


def load_prompt(filename: str) -> str:
    """Load a prompt file from the prompts/ directory."""
    path = get_settings().prompt_path(filename)
    if not path.exists():
        logger.warning("Prompt file not found: %s", path)
        return ""
    return path.read_text(encoding="utf-8")


def get_debater_system_prompt(role: str) -> str:
    """
    Build the full system prompt for a debater.
    Combines the generic debater prompt with role-specific instructions.
    """
    base = load_prompt("debater_system.md")

    # Load role-specific supplement
    role_file = f"debater_{role}.md"
    supplement = load_prompt(role_file)
    
    # Fallback to generic `proposer` or `opposer` if specific `_1, _2` missing
    if not supplement:
        if role.startswith("proposer"):
            supplement = load_prompt("debater_proposer.md")
        elif role.startswith("opposer"):
            supplement = load_prompt("debater_opposer.md")

    if supplement:
        return f"{base}\n\n---\n\n{supplement}"
    return base


def get_fact_checker_prompt() -> str:
    return load_prompt("fact_checker_system.md")


def get_judge_prompt() -> str:
    return load_prompt("judge_system.md")
