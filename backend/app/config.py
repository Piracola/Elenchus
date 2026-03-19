"""
Configuration loader for Elenchus.

Reads secrets from `.env` and runtime behavior from `config.yaml`.
"""

from __future__ import annotations

from functools import lru_cache
import logging
import os
from pathlib import Path
from threading import Lock
from typing import Any

import yaml
from dotenv import load_dotenv, set_key, unset_key
from pydantic import Field
from pydantic_settings import BaseSettings

from app.runtime_paths import prepare_runtime_environment

_RUNTIME_PATHS = prepare_runtime_environment()
_PROJECT_ROOT = _RUNTIME_PATHS.runtime_root
_CONFIG_WRITE_LOCK = Lock()
logger = logging.getLogger(__name__)
load_dotenv(_RUNTIME_PATHS.env_file)

SUPPORTED_SEARCH_PROVIDERS = {"duckduckgo", "searxng", "tavily"}
DEFAULT_SEARXNG_BASE_URL = "http://localhost:8080"
DEFAULT_TAVILY_API_URL = "https://api.tavily.com/search"


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


def _normalize_search_provider(provider: str) -> str:
    normalized = (provider or "").strip().lower()
    if normalized not in SUPPORTED_SEARCH_PROVIDERS:
        raise ValueError(f"Unsupported search provider: {provider}")
    return normalized


def _write_env_value(key: str, value: str | None) -> None:
    env_path = _RUNTIME_PATHS.env_file
    env_path.parent.mkdir(parents=True, exist_ok=True)
    if not env_path.exists():
        env_path.touch()

    if value is None:
        unset_key(str(env_path), key)
        os.environ.pop(key, None)
        return

    set_key(str(env_path), key, value, quote_mode="never")
    os.environ[key] = value


def _clear_settings_cache() -> None:
    get_settings.cache_clear()


def persist_search_provider(provider: str) -> None:
    """
    Persist selected search provider into runtime config.yaml.

    This keeps the UI-selected provider stable across app restarts and upgrades.
    """
    persist_search_settings(provider=provider)


def persist_search_settings(
    *,
    provider: str | None = None,
    searxng_base_url: str | None = None,
    searxng_api_key: str | None = None,
    clear_searxng_api_key: bool = False,
    tavily_api_key: str | None = None,
    clear_tavily_api_key: bool = False,
    tavily_api_url: str | None = None,
) -> None:
    """
    Persist runtime-editable search settings.

    Provider choice is stored in config.yaml while provider credentials and
    endpoint overrides are stored in the runtime .env file.
    """
    normalized_provider = _normalize_search_provider(provider) if provider is not None else None
    normalized_searxng_base_url = (
        (searxng_base_url or "").strip() or DEFAULT_SEARXNG_BASE_URL
        if searxng_base_url is not None
        else None
    )
    normalized_tavily_api_url = (
        (tavily_api_url or "").strip() or DEFAULT_TAVILY_API_URL
        if tavily_api_url is not None
        else None
    )
    normalized_searxng_api_key = (searxng_api_key or "").strip()
    normalized_tavily_api_key = (tavily_api_key or "").strip()

    with _CONFIG_WRITE_LOCK:
        if normalized_provider is not None:
            config = _load_yaml_config()
            search = config.get("search")
            if not isinstance(search, dict):
                search = {}
                config["search"] = search
            search["provider"] = normalized_provider
            if "max_results_per_query" not in search:
                search["max_results_per_query"] = 5
            _write_yaml_config(config)
            logger.info("Persisted runtime search provider: %s", normalized_provider)

        if normalized_searxng_base_url is not None:
            _write_env_value("SEARXNG_BASE_URL", normalized_searxng_base_url)

        if clear_searxng_api_key:
            _write_env_value("SEARXNG_API_KEY", None)
        elif normalized_searxng_api_key:
            _write_env_value("SEARXNG_API_KEY", normalized_searxng_api_key)

        if normalized_tavily_api_url is not None:
            _write_env_value("TAVILY_API_URL", normalized_tavily_api_url)

        if clear_tavily_api_key:
            _write_env_value("TAVILY_API_KEY", None)
        elif normalized_tavily_api_key:
            _write_env_value("TAVILY_API_KEY", normalized_tavily_api_key)

    _clear_settings_cache()


def get_search_provider_settings_snapshot() -> dict[str, dict[str, Any]]:
    """Return the current runtime-editable search provider settings."""
    settings = get_settings()
    return {
        "searxng": {
            "base_url": settings.env.searxng_base_url,
            "api_key_configured": bool(settings.env.searxng_api_key),
        },
        "tavily": {
            "api_url": settings.env.tavily_api_url,
            "api_key_configured": bool(settings.env.tavily_api_key),
        },
    }


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

    searxng_base_url: str = Field(default=DEFAULT_SEARXNG_BASE_URL, alias="SEARXNG_BASE_URL")
    searxng_api_key: str = Field(default="", alias="SEARXNG_API_KEY")
    tavily_api_key: str = Field(default="", alias="TAVILY_API_KEY")
    tavily_api_url: str = Field(default=DEFAULT_TAVILY_API_URL, alias="TAVILY_API_URL")

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
