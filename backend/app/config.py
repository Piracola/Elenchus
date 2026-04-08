"""
Configuration loader for Elenchus.

Reads runtime settings from a single `runtime/config.json` source.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

from app.runtime_config_store import (
    DEFAULT_SEARXNG_BASE_URL,
    DEFAULT_TAVILY_API_URL,
    SUPPORTED_SEARCH_PROVIDERS,
    load_runtime_config,
    update_runtime_config,
)
from app.runtime_paths import prepare_runtime_environment

_RUNTIME_PATHS = prepare_runtime_environment()
_PROJECT_ROOT = _RUNTIME_PATHS.runtime_root


class SearchConfig:
    """Search provider configuration."""

    def __init__(self, data: dict[str, Any] | None = None):
        data = data or {}
        self.provider: str = str(data.get("provider") or "duckduckgo")
        self.max_results_per_query: int = int(data.get("max_results_per_query") or 5)
        searxng = data.get("searxng") if isinstance(data.get("searxng"), dict) else {}
        tavily = data.get("tavily") if isinstance(data.get("tavily"), dict) else {}
        self.searxng_base_url: str = str(searxng.get("base_url") or DEFAULT_SEARXNG_BASE_URL)
        self.searxng_api_key: str = str(searxng.get("api_key") or "")
        self.tavily_api_url: str = str(tavily.get("api_url") or DEFAULT_TAVILY_API_URL)
        self.tavily_api_key: str = str(tavily.get("api_key") or "")


class ContextWindowConfig:
    def __init__(self, data: dict[str, Any] | None = None):
        data = data or {}
        self.recent_turns_to_keep: int = int(data.get("recent_turns_to_keep") or 3)
        self.enable_summary_compression: bool = bool(
            data.get("enable_summary_compression", True)
        )


class DebateConfig:
    def __init__(self, data: dict[str, Any] | None = None):
        data = data or {}
        self.default_max_turns: int = int(data.get("default_max_turns") or 5)
        self.default_max_tokens: int = int(data.get("default_max_tokens") or 64000)
        if self.default_max_tokens < 1:
            self.default_max_tokens = 64000
        self.context_window = ContextWindowConfig(data.get("context_window"))


class EnvSettings:
    """Compatibility wrapper for runtime values historically read from `.env`."""

    def __init__(self, data: dict[str, Any] | None = None, *, search: SearchConfig):
        data = data or {}
        cors_origins = data.get("cors_origins")
        if isinstance(cors_origins, list):
            cors_origin_text = ",".join(str(item).strip() for item in cors_origins if str(item).strip())
        else:
            cors_origin_text = str(cors_origins or "")

        self.searxng_base_url: str = search.searxng_base_url
        self.searxng_api_key: str = search.searxng_api_key
        self.tavily_api_key: str = search.tavily_api_key
        self.tavily_api_url: str = search.tavily_api_url
        self.host: str = str(data.get("host") or "0.0.0.0")
        self.port: int = int(data.get("port") or 8001)
        self.debug: bool = bool(data.get("debug", False))
        self.cors_origins: str = cors_origin_text


class AuthSettings:
    def __init__(self, data: dict[str, Any] | None = None):
        data = data or {}
        self.enabled: bool = bool(data.get("enabled", False))
        self.jwt_secret_key: str = str(data.get("jwt_secret_key") or "change-me-in-production")
        self.jwt_expire_minutes: int = int(data.get("jwt_expire_minutes") or 10080)


class LoggingSettings:
    def __init__(self, data: dict[str, Any] | None = None):
        data = data or {}
        self.level: str = str(data.get("level") or "INFO").upper()
        self.log_dir: str = str(data.get("log_dir") or "logs")
        self.backup_count: int = int(data.get("backup_count") or 7)


class DemoSettings:
    def __init__(self, data: dict[str, Any] | None = None):
        data = data or {}
        self.enabled: bool = bool(data.get("enabled", False))
        self.admin_username: str = str(data.get("admin_username") or "admin")
        self.admin_password_hash: str = str(data.get("admin_password_hash") or "")
        self.allowed_models: list[str] = list(
            data.get("allowed_models")
            or ["gpt-4o-mini", "claude-sonnet-4-6-20250514", "gemini-2.5-flash"]
        )


class Settings:
    """Unified settings object backed by `runtime/config.json`."""

    def __init__(self) -> None:
        config = load_runtime_config()
        self.search = SearchConfig(config.get("search"))
        self.debate = DebateConfig(config.get("debate"))
        self.env = EnvSettings(config.get("server"), search=self.search)
        self.auth = AuthSettings(config.get("auth"))
        self.logging = LoggingSettings(config.get("logging"))
        self.demo = DemoSettings(config.get("demo"))

    @property
    def project_root(self) -> Path:
        return _PROJECT_ROOT

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


def _clear_settings_cache() -> None:
    get_settings.cache_clear()


def _normalize_search_provider(provider: str) -> str:
    normalized = (provider or "").strip().lower()
    if normalized not in SUPPORTED_SEARCH_PROVIDERS:
        raise ValueError(f"Unsupported search provider: {provider}")
    return normalized


def persist_search_provider(provider: str) -> None:
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

    update_runtime_config(
        lambda config: _update_search_config(
            config,
            provider=normalized_provider,
            searxng_base_url=normalized_searxng_base_url,
            searxng_api_key=normalized_searxng_api_key,
            clear_searxng_api_key=clear_searxng_api_key,
            tavily_api_key=normalized_tavily_api_key,
            clear_tavily_api_key=clear_tavily_api_key,
            tavily_api_url=normalized_tavily_api_url,
        )
    )
    _clear_settings_cache()


def _update_search_config(
    config: dict[str, Any],
    *,
    provider: str | None,
    searxng_base_url: str | None,
    searxng_api_key: str,
    clear_searxng_api_key: bool,
    tavily_api_key: str,
    clear_tavily_api_key: bool,
    tavily_api_url: str | None,
) -> dict[str, Any]:
    search = config.setdefault("search", {})
    searxng = search.setdefault("searxng", {})
    tavily = search.setdefault("tavily", {})

    if provider is not None:
        search["provider"] = provider
    if "max_results_per_query" not in search:
        search["max_results_per_query"] = 5
    if searxng_base_url is not None:
        searxng["base_url"] = searxng_base_url
    if clear_searxng_api_key:
        searxng["api_key"] = ""
    elif searxng_api_key:
        searxng["api_key"] = searxng_api_key
    if tavily_api_url is not None:
        tavily["api_url"] = tavily_api_url
    if clear_tavily_api_key:
        tavily["api_key"] = ""
    elif tavily_api_key:
        tavily["api_key"] = tavily_api_key
    return config


def get_search_provider_settings_snapshot() -> dict[str, dict[str, Any]]:
    settings = get_settings()
    return {
        "searxng": {
            "base_url": settings.search.searxng_base_url,
            "api_key_configured": bool(settings.search.searxng_api_key),
        },
        "tavily": {
            "api_url": settings.search.tavily_api_url,
            "api_key_configured": bool(settings.search.tavily_api_key),
        },
    }
