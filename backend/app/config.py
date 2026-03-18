"""
Configuration loader for Elenchus.

Reads secrets from `.env` and runtime behavior from `config.yaml`.
"""

from __future__ import annotations

from functools import lru_cache
import logging
from pathlib import Path
from threading import Lock
from typing import Any

import yaml
from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings

from app.runtime_paths import prepare_runtime_environment

_RUNTIME_PATHS = prepare_runtime_environment()
_PROJECT_ROOT = _RUNTIME_PATHS.runtime_root
_CONFIG_WRITE_LOCK = Lock()
logger = logging.getLogger(__name__)
load_dotenv(_RUNTIME_PATHS.env_file)


def _sqlite_url(path: Path, driver: str = "sqlite+aiosqlite") -> str:
    return f"{driver}:///{path.resolve().as_posix()}"


def _default_database_url() -> str:
    return _sqlite_url(_RUNTIME_PATHS.default_database_file)


def _normalize_database_url(value: str) -> str:
    candidate = value.strip()
    sqlite_prefixes = (
        "sqlite+aiosqlite:///./",
        "sqlite:///./",
    )
    for prefix in sqlite_prefixes:
        if candidate.startswith(prefix):
            relative_path = candidate[len(prefix) :]
            driver = "sqlite+aiosqlite" if candidate.startswith("sqlite+aiosqlite") else "sqlite"
            return _sqlite_url(_RUNTIME_PATHS.runtime_root / relative_path, driver=driver)
    return candidate


def _load_yaml_config() -> dict[str, Any]:
    config_path = _RUNTIME_PATHS.config_file
    if not config_path.exists():
        return {}

    with open(config_path, "r", encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


def _write_yaml_config(data: dict[str, Any]) -> None:
    config_path = _RUNTIME_PATHS.config_file
    config_path.parent.mkdir(parents=True, exist_ok=True)
    with open(config_path, "w", encoding="utf-8") as handle:
        yaml.safe_dump(data, handle, allow_unicode=True, sort_keys=False)


def persist_search_provider(provider: str) -> None:
    """
    Persist selected search provider into runtime config.yaml.

    This keeps the UI-selected provider stable across app restarts and upgrades.
    """
    normalized = (provider or "").strip().lower()
    if normalized not in {"duckduckgo", "searxng", "tavily"}:
        raise ValueError(f"Unsupported search provider: {provider}")

    with _CONFIG_WRITE_LOCK:
        config = _load_yaml_config()
        search = config.get("search")
        if not isinstance(search, dict):
            search = {}
            config["search"] = search
        search["provider"] = normalized
        if "max_results_per_query" not in search:
            search["max_results_per_query"] = 5
        _write_yaml_config(config)
        logger.info("Persisted runtime search provider: %s", normalized)


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
        default=_default_database_url(),
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

    model_config = {"env_file": str(_RUNTIME_PATHS.env_file), "extra": "ignore"}

    def model_post_init(self, __context: Any) -> None:
        self.database_url = _normalize_database_url(self.database_url)


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

    @property
    def backend_runtime_dir(self) -> Path:
        return _RUNTIME_PATHS.runtime_backend_dir

    @property
    def backend_source_dir(self) -> Path:
        return _RUNTIME_PATHS.backend_bundle_dir

    def prompt_path(self, filename: str) -> Path:
        return _RUNTIME_PATHS.prompts_dir / filename

    @property
    def frontend_dist_dir(self) -> Path:
        return _RUNTIME_PATHS.frontend_dist_dir

    @property
    def runtime_root(self) -> Path:
        return _RUNTIME_PATHS.runtime_root


@lru_cache()
def get_settings() -> Settings:
    """Return the singleton settings object."""
    return Settings()
