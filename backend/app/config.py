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

from app.models.schemas import ContextRuntimeConfig
from app.runtime_config_store import (
    load_runtime_config,
    normalize_search_provider_name,
    supported_search_provider_names,
    update_runtime_config,
)
from app.runtime_paths import prepare_runtime_environment
from app.search.limits import clamp_results_per_query

_RUNTIME_PATHS = prepare_runtime_environment()
_PROJECT_ROOT = _RUNTIME_PATHS.runtime_root


class SearchConfig(BaseModel):
    """Search provider configuration.

    Per-provider settings live in one nested map keyed by provider name, so a
    new provider needs no field here.
    """

    provider: str = "ddgs"
    max_results_per_query: int = 5
    provider_settings: dict[str, dict[str, str]] = Field(default_factory=dict)

    def settings_for(self, provider_name: str) -> dict[str, str]:
        """Stored settings of one provider (empty when never configured)."""
        return dict(self.provider_settings.get(provider_name) or {})

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None = None) -> SearchConfig:
        data = data or {}
        raw_sections = data.get("providers")
        sections = raw_sections if isinstance(raw_sections, dict) else {}
        # Tolerate the pre-registry layout so an old config still loads.
        legacy_custom = data.get("custom")
        if isinstance(legacy_custom, dict) and "custom" not in sections:
            sections = {**sections, "custom": legacy_custom}
        try:
            max_results = int(data.get("max_results_per_query") or 5)
        except (TypeError, ValueError):
            max_results = 5
        return cls(
            provider=normalize_search_provider_name(str(data.get("provider") or "ddgs")),
            max_results_per_query=clamp_results_per_query(max_results),
            provider_settings={
                str(name): {
                    str(key): str(value or "")
                    for key, value in section.items()
                }
                for name, section in sections.items()
                if isinstance(section, dict)
            },
        )


class DebateConfig(BaseModel):
    default_max_turns: int = 5
    default_max_tokens: int = 64000
    context_runtime: ContextRuntimeConfig = Field(default_factory=ContextRuntimeConfig)

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None = None) -> DebateConfig:
        data = data or {}
        max_tokens = int(data.get("default_max_tokens") or 64000)
        if max_tokens < 1:
            max_tokens = 64000
        return cls(
            default_max_turns=int(data.get("default_max_turns") or 5),
            default_max_tokens=max_tokens,
            context_runtime=ContextRuntimeConfig.model_validate(
                data.get("context_runtime") or {}
            ),
        )


class EnvSettings(BaseModel):
    """Compatibility wrapper for runtime values historically read from `.env`."""

    host: str = "0.0.0.0"
    port: int = 8001
    debug: bool = False
    cors_origins: str = ""
    database_url: str = ""

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
            host=str(data.get("host") or "0.0.0.0"),
            port=int(data.get("port") or 8001),
            debug=bool(data.get("debug", False)),
            cors_origins=cors_origin_text,
            database_url=str(data.get("database_url") or ""),
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


class Settings(BaseModel):
    """Unified settings object backed by `runtime/config.json`."""

    search: SearchConfig = Field(default_factory=SearchConfig)
    debate: DebateConfig = Field(default_factory=DebateConfig)
    env: EnvSettings = Field(default_factory=EnvSettings)
    logging: LoggingSettings = Field(default_factory=LoggingSettings)

    def __init__(self, **data: Any) -> None:
        # If called directly (not from Pydantic parse), load from config file
        if not data:
            config = load_runtime_config()
            search = SearchConfig.from_dict(config.get("search"))
            debate = DebateConfig.from_dict(config.get("debate"))
            env = EnvSettings.from_dict(config.get("server"), search=search)
            logging_cfg = LoggingSettings.from_dict(config.get("logging"))
            super().__init__(
                search=search,
                debate=debate,
                env=env,
                logging=logging_cfg,
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


@lru_cache
def get_settings() -> Settings:
    """Return the singleton settings object."""
    return Settings()


def _clear_settings_cache() -> None:
    get_settings.cache_clear()


def _normalize_search_provider(provider: str) -> str:
    normalized = normalize_search_provider_name(provider)
    if normalized not in supported_search_provider_names():
        raise ValueError(f"Unsupported search provider: {provider}")
    return normalized


def persist_search_provider(provider: str) -> None:
    persist_search_settings(provider=provider)


def persist_search_settings(
    *,
    provider: str | None = None,
    max_results_per_query: int | None = None,
    provider_settings: dict[str, dict[str, str | None]] | None = None,
) -> None:
    """Write search settings.

    `provider_settings` carries only what should change: a field present with a
    value sets it, a field present as `None` or `""` clears it, and an absent
    field is left untouched. That makes a separate "clear this key" flag
    unnecessary.
    """
    normalized_provider = _normalize_search_provider(provider) if provider is not None else None

    update_runtime_config(
        lambda config: _update_search_config(
            config,
            provider=normalized_provider,
            max_results_per_query=max_results_per_query,
            provider_settings=provider_settings or {},
        )
    )
    _clear_settings_cache()


def _update_search_config(
    config: dict[str, Any],
    *,
    provider: str | None,
    max_results_per_query: int | None,
    provider_settings: dict[str, dict[str, str | None]],
) -> dict[str, Any]:
    from app.search.registry import provider_field_specs

    search = config.setdefault("search", {})
    sections = search.setdefault("providers", {})

    if provider is not None:
        search["provider"] = provider
    if max_results_per_query is not None:
        search["max_results_per_query"] = clamp_results_per_query(max_results_per_query)
    if "max_results_per_query" not in search:
        search["max_results_per_query"] = 5

    for provider_name, updates in provider_settings.items():
        if not isinstance(updates, dict):
            continue
        known_keys = {field.key for field in provider_field_specs(provider_name)}
        if not known_keys:
            continue
        section = sections.setdefault(provider_name, {})
        for key, value in updates.items():
            if key not in known_keys:
                continue
            section[key] = str(value or "").strip()
    return config


def get_search_provider_settings_snapshot() -> dict[str, dict[str, Any]]:
    """Per-provider stored values, with secrets reduced to a boolean.

    Shape: `{provider: {field_key: value, "<secret_key>_configured": bool}}`.
    Secret values are never included so they cannot leak to a client.
    """
    from app.search.registry import provider_classes

    settings = get_settings()
    snapshot: dict[str, dict[str, Any]] = {}
    for provider_class in provider_classes():
        stored = settings.search.settings_for(provider_class.name)
        if not provider_class.config_fields:
            continue
        section: dict[str, Any] = {}
        for field in provider_class.config_fields:
            value = str(stored.get(field.key, "") or "")
            if field.secret:
                section[f"{field.key}_configured"] = bool(value)
            else:
                section[field.key] = value
        snapshot[provider_class.name] = section
    return snapshot
