"""Default configuration factories for session runtime."""

from __future__ import annotations

from typing import Any

from app.models.schemas import DebateMode


def default_reasoning_config() -> dict[str, bool]:
    return {
        "consensus_enabled": True,
    }


def default_speech_config() -> dict[str, int]:
    return {
        "proposer_max_chars": 0,
        "opposer_max_chars": 0,
    }


def default_mode_config(debate_mode: str) -> dict[str, Any]:
    if debate_mode == DebateMode.SOPHISTRY_EXPERIMENT.value:
        return {
            "seed_reference_enabled": True,
            "observer_enabled": True,
            "artifact_detail_level": "full",
        }
    return {}
