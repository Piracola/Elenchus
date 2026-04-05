"""Default configuration factories for session runtime."""

from __future__ import annotations

from typing import Any

from app.models.schemas import DebateMode


def default_team_config() -> dict[str, int]:
    return {
        "agents_per_team": 0,
        "discussion_rounds": 0,
    }


def default_jury_config() -> dict[str, int]:
    return {
        "agents_per_jury": 0,
        "discussion_rounds": 0,
    }


def default_reasoning_config() -> dict[str, bool]:
    return {
        "steelman_enabled": True,
        "counterfactual_enabled": True,
        "consensus_enabled": True,
    }


def default_mode_config(debate_mode: str) -> dict[str, Any]:
    if debate_mode == DebateMode.SOPHISTRY_EXPERIMENT.value:
        return {
            "seed_reference_enabled": True,
            "observer_enabled": True,
            "artifact_detail_level": "full",
        }
    return {}
