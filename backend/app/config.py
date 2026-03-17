"""
Configuration loader for Elenchus.

Reads secrets from `.env` and runtime behavior from `config.yaml`.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_PROJECT_ROOT / ".env")


def _load_yaml_config() -> dict[str, Any]:
    config_path = _PROJECT_ROOT / "config.yaml"
    if not config_path.exists():
        return {}

    with open(config_path, "r", encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


class SearchConfig:
    """Search provider configuration."""

    def __init__(self, data: dict[str, Any] | None = None):
        data = data or {}
        self.provider: str = data.get("provider", "duckduckgo")
        self.max_results_per_query: int = data.get("max_results_per_query", 5)


class ContextWindowConfig:
    def __init__(self, data: dict[str, Any] | None = None):
        data = data or {}
        self.recent_turns_to_keep: int = data.get("recent_turns_to_keep", 3)
        self.enable_summary_compression: bool = data.get("enable_summary_compression", True)


class DebateConfig:
    def __init__(self, data: dict[str, Any] | None = None):
        data = data or {}
        self.default_max_turns: int = data.get("default_max_turns", 5)
        self.context_window = ContextWindowConfig(data.get("context_window"))


class EnvSettings(BaseSettings):
    """Environment-specific values loaded from `.env`."""

    searxng_base_url: str = Field(default="http://localhost:8080", alias="SEARXNG_BASE_URL")
    tavily_api_key: str = Field(default="", alias="TAVILY_API_KEY")

    database_url: str = Field(
        default="sqlite+aiosqlite:///./elenchus.db",
        alias="DATABASE_URL",
    )

    host: str = Field(default="0.0.0.0", alias="HOST")
    port: int = Field(default=8001, alias="PORT")
    debug: bool = Field(default=False, alias="DEBUG")
    cors_origins: str = Field(
        default="http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174",
        alias="CORS_ORIGINS",
        description="Comma-separated list of allowed CORS origins",
    )

    model_config = {"env_file": str(_PROJECT_ROOT / ".env"), "extra": "ignore"}


class Settings:
    """Unified settings object combining `.env` and `config.yaml`."""

    def __init__(self) -> None:
        self.env = EnvSettings()
        yaml_cfg = _load_yaml_config()
        self.search = SearchConfig(yaml_cfg.get("search"))
        self.debate = DebateConfig(yaml_cfg.get("debate"))

    @property
    def project_root(self) -> Path:
        return _PROJECT_ROOT

    def prompt_path(self, filename: str) -> Path:
        return _PROJECT_ROOT / "prompts" / filename


@lru_cache()
def get_settings() -> Settings:
    """Return the singleton settings object."""
    return Settings()
