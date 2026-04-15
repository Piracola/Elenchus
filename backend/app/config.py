"""
Configuration loader for Elenchus.

Reads runtime settings from a single `runtime/config.json` source.
Uses Pydantic BaseModel for automatic validation and type safety.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

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


class SearchConfig(BaseModel):
    """Search provider configuration."""

    provider: str = "duckduckgo"
    max_results_per_query: int = 5
    searxng_base_url: str = DEFAULT_SEARXNG_BASE_URL
    searxng_api_key: str = ""
    tavily_api_url: str = DEFAULT_TAVILY_API_URL
    tavily_api_key: str = ""

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None = None) -> SearchConfig:
        data = data or {}
        searxng = data.get("searxng") if isinstance(data.get("searxng"), dict) else {}
        tavily = data.get("tavily") if isinstance(data.get("tavily"), dict) else {}
        return cls(
            provider=str(data.get("provider") or "duckduckgo"),
            max_results_per_query=int(data.get("max_results_per_query") or 5),
            searxng_base_url=str(searxng.get("base_url") or DEFAULT_SEARXNG_BASE_URL),
            searxng_api_key=str(searxng.get("api_key") or ""),
            tavily_api_url=str(tavily.get("api_url") or DEFAULT_TAVILY_API_URL),
            tavily_api_key=str(tavily.get("api_key") or ""),
        )


class ContextWindowConfig(BaseModel):
    recent_turns_to_keep: int = 3
    enable_summary_compression: bool = True

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None = None) -> ContextWindowConfig:
        data = data or {}
        return cls(
            recent_turns_to_keep=int(data.get("recent_turns_to_keep") or 3),
            enable_summary_compression=bool(data.get("enable_summary_compression", True)),
        )


class DebateConfig(BaseModel):
    default_max_turns: int = 5
    default_max_tokens: int = 64000
    context_window: ContextWindowConfig = Field(default_factory=ContextWindowConfig)

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None = None) -> DebateConfig:
        data = data or {}
        max_tokens = int(data.get("default_max_tokens") or 64000)
        if max_tokens < 1:
            max_tokens = 64000
        return cls(
            default_max_turns=int(data.get("default_max_turns") or 5),
            default_max_tokens=max_tokens,
            context_window=ContextWindowConfig.from_dict(data.get("context_window")),
        )


class EnvSettings(BaseModel):
    """Compatibility wrapper for runtime values historically read from `.env`."""

    searxng_base_url: str = DEFAULT_SEARXNG_BASE_URL
    searxng_api_key: str = ""
    tavily_api_key: str = ""
    tavily_api_url: str = DEFAULT_TAVILY_API_URL
    host: str = "0.0.0.0"
    port: int = 8001
    debug: bool = False
    cors_origins: str = ""

    @classmethod
    def from_dict(
        cls, data: dict[str, Any] | None = None, *, search: SearchConfig
    ) -> EnvSettings:
        data = data or {}
        cors_origins = data.get("cors_origins")
        if isinstance(cors_origins, list):
            cors_origin_text = ",".join(
                str(item).strip() for item in cors_origins if str(item).strip()
            )
        else:
            cors_origin_text = str(cors_origins or "")

        return cls(
            searxng_base_url=search.searxng_base_url,
            searxng_api_key=search.searxng_api_key,
            tavily_api_key=search.tavily_api_key,
            tavily_api_url=search.tavily_api_url,
            host=str(data.get("host") or "0.0.0.0"),
            port=int(data.get("port") or 8001),
            debug=bool(data.get("debug", False)),
            cors_origins=cors_origin_text,
        )


class AuthSettings(BaseModel):
    enabled: bool = False
    jwt_secret_key: str = "change-me-in-production"
    jwt_expire_minutes: int = 10080

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None = None) -> AuthSettings:
        data = data or {}
        key = str(data.get("jwt_secret_key") or "change-me-in-production")
        if key == "change-me-in-production":
            import logging
            logging.getLogger(__name__).warning(
                "JWT secret key is set to the default value 'change-me-in-production'. "
                "Please update it in runtime/config.json for production use."
            )
        return cls(
            enabled=bool(data.get("enabled", False)),
            jwt_secret_key=key,
            jwt_expire_minutes=int(data.get("jwt_expire_minutes") or 10080),
        )


class LoggingSettings(BaseModel):
    level: str = "INFO"
    log_dir: str = "logs"
    backup_count: int = 7

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None = None) -> LoggingSettings:
        data = data or {}
        return cls(
            level=str(data.get("level") or "INFO").upper(),
            log_dir=str(data.get("log_dir") or "logs"),
            backup_count=int(data.get("backup_count") or 7),
        )


class DemoSettings(BaseModel):
    enabled: bool = False
    admin_username: str = "admin"
    admin_password_hash: str = ""
    allowed_models: list[str] = Field(
        default_factory=lambda: ["gpt-4o-mini", "claude-sonnet-4-6-20250514", "gemini-2.5-flash"]
    )

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None = None) -> DemoSettings:
        data = data or {}
        return cls(
            enabled=bool(data.get("enabled", False)),
            admin_username=str(data.get("admin_username") or "admin"),
            admin_password_hash=str(data.get("admin_password_hash") or ""),
            allowed_models=list(
                data.get("allowed_models")
                or ["gpt-4o-mini", "claude-sonnet-4-6-20250514", "gemini-2.5-flash"]
            ),
        )


class Settings(BaseModel):
    """Unified settings object backed by `runtime/config.json`."""

    search: SearchConfig = Field(default_factory=SearchConfig)
    debate: DebateConfig = Field(default_factory=DebateConfig)
    env: EnvSettings = Field(default_factory=EnvSettings)
    auth: AuthSettings = Field(default_factory=AuthSettings)
    logging: LoggingSettings = Field(default_factory=LoggingSettings)
    demo: DemoSettings = Field(default_factory=DemoSettings)

    def __init__(self, **data: Any) -> None:
        # If called directly (not from Pydantic parse), load from config file
        if not data:
            config = load_runtime_config()
            search = SearchConfig.from_dict(config.get("search"))
            debate = DebateConfig.from_dict(config.get("debate"))
            env = EnvSettings.from_dict(config.get("server"), search=search)
            auth = AuthSettings.from_dict(config.get("auth"))
            logging_cfg = LoggingSettings.from_dict(config.get("logging"))
            demo = DemoSettings.from_dict(config.get("demo"))
            super().__init__(
                search=search,
                debate=debate,
                env=env,
                auth=auth,
                logging=logging_cfg,
                demo=demo,
            )
        else:
            super().__init__(**data)

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
