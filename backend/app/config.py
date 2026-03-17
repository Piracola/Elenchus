"""
Configuration loader for Elenchus.
Reads from .env (secrets/environment) and config.yaml (application behaviour).

Secret split:
  .env                    — search keys, DB URL, server params, encryption key
  database (providers table) — LLM provider API keys (Fernet-encrypted, managed via UI)
"""

from __future__ import annotations

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


# ── Search configuration ─────────────────────────────────────────

class SearchConfig:
    """Search provider configuration."""

    def __init__(self, data: dict[str, Any] | None = None):
        data = data or {}
        self.provider: str = data.get("provider", "duckduckgo")
        self.max_results_per_query: int = data.get("max_results_per_query", 5)


# ── Debate configuration ─────────────────────────────────────────

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


# ── Environment-based settings (.env) ────────────────────────────

class EnvSettings(BaseSettings):
    """Sensitive / environment-specific values loaded from .env"""

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
    port: int = Field(default=8001, alias="PORT")
    debug: bool = Field(default=False, alias="DEBUG")
    cors_origins: str = Field(
        default="http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174",
        alias="CORS_ORIGINS",
        description="Comma-separated list of allowed CORS origins",
    )

    # ── Authentication ───────────────────────────────────────────
    jwt_secret_key: str = Field(
        default="change-me-in-production",
        alias="JWT_SECRET_KEY",
        description="Secret key for JWT token signing",
    )
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    jwt_expire_minutes: int = Field(
        default=60 * 24 * 7,  # 7 days
        alias="JWT_EXPIRE_MINUTES",
    )
    auth_enabled: bool = Field(
        default=False,
        alias="AUTH_ENABLED",
        description="Enable authentication (set to true for production)",
    )

    model_config = {"env_file": str(_PROJECT_ROOT / ".env"), "extra": "ignore"}


# ── Top-level application settings ───────────────────────────────

class Settings:
    """Unified settings object combining .env and config.yaml."""

    def __init__(self) -> None:
        self.env = EnvSettings()
        yaml_cfg = _load_yaml_config()

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
