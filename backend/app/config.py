"""
Configuration loader for Elenchus.
Reads from .env (secrets) and config.yaml (application settings).
"""

from __future__ import annotations

import os
from pathlib import Path
from functools import lru_cache
from typing import Any

import yaml
from pydantic import Field
from pydantic_settings import BaseSettings
from dotenv import load_dotenv


_PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_PROJECT_ROOT / ".env")


def _load_yaml_config() -> dict[str, Any]:
    """Load config.yaml from the project root."""
    config_path = _PROJECT_ROOT / "config.yaml"
    if not config_path.exists():
        return {}
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


# ── Agent-level model configuration ──────────────────────────────

class AgentModelConfig:
    """Configuration for a single agent's LLM."""

    def __init__(self, data: dict[str, Any] | None = None):
        data = data or {}
        self.model: str = data.get("model", "gpt-4o")
        self.temperature: float = data.get("temperature", 0.7)
        self.max_tokens: int = data.get("max_tokens", 1500)
        # Optional per-agent overrides — takes priority over global .env values
        self.api_base_url: str | None = data.get("api_base_url") or None
        self.api_key: str | None = data.get("api_key") or None


# ── Search configuration ─────────────────────────────────────────

class SearchConfig:
    """Search provider configuration."""

    def __init__(self, data: dict[str, Any] | None = None):
        data = data or {}
        self.provider: str = data.get("provider", "searxng")
        self.max_results_per_query: int = data.get("max_results_per_query", 5)


# ── Debate configuration ─────────────────────────────────────────

class ContextWindowConfig:
    def __init__(self, data: dict[str, Any] | None = None):
        data = data or {}
        self.recent_turns_to_keep: int = data.get("recent_turns_to_keep", 3)
        self.enable_summary_compression: bool = data.get("enable_summary_compression", True)


class RetryConfig:
    def __init__(self, data: dict[str, Any] | None = None):
        data = data or {}
        self.max_retries: int = data.get("max_retries", 3)
        self.base_delay_seconds: float = data.get("base_delay_seconds", 1.0)


class DebateConfig:
    def __init__(self, data: dict[str, Any] | None = None):
        data = data or {}
        self.default_max_turns: int = data.get("default_max_turns", 5)
        self.context_window = ContextWindowConfig(data.get("context_window"))
        self.retry = RetryConfig(data.get("retry"))


# ── Environment-based settings (.env) ────────────────────────────

class EnvSettings(BaseSettings):
    """Sensitive / environment-specific values loaded from .env"""

    # ── LLM Authentication ───────────────────────────────────────
    # We load .env using load_dotenv() so LiteLLM can pick up keys
    # natively from the environment. No Pydantic wrappers needed here!

    # ── Search ───────────────────────────────────────────────────
    searxng_base_url: str = Field(default="http://localhost:8080", alias="SEARXNG_BASE_URL")
    tavily_api_key: str = Field(default="", alias="TAVILY_API_KEY")

    # ── Database ─────────────────────────────────────────────────
    database_url: str = Field(
        default="sqlite+aiosqlite:///./elenchus.db",
        alias="DATABASE_URL",
    )

    # ── Server ───────────────────────────────────────────────────
    host: str = Field(default="0.0.0.0", alias="HOST")
    port: int = Field(default=8000, alias="PORT")
    debug: bool = Field(default=False, alias="DEBUG")

    model_config = {"env_file": str(_PROJECT_ROOT / ".env"), "extra": "ignore"}


# ── Top-level application settings ───────────────────────────────

class Settings:
    """Unified settings object combining .env and config.yaml."""

    def __init__(self) -> None:
        self.env = EnvSettings()
        yaml_cfg = _load_yaml_config()

        agents_cfg = yaml_cfg.get("agents", {})
        self.debater = AgentModelConfig(agents_cfg.get("debater"))
        self.judge = AgentModelConfig(agents_cfg.get("judge"))
        self.fact_checker = AgentModelConfig(agents_cfg.get("fact_checker"))

        self.search = SearchConfig(yaml_cfg.get("search"))
        self.debate = DebateConfig(yaml_cfg.get("debate"))

    # Convenience helpers
    @property
    def project_root(self) -> Path:
        return _PROJECT_ROOT

    def prompt_path(self, filename: str) -> Path:
        return _PROJECT_ROOT / "prompts" / filename


@lru_cache()
def get_settings() -> Settings:
    """Singleton settings accessor."""
    return Settings()
