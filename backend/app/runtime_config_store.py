from __future__ import annotations

import json
import os
import sqlite3
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any

import yaml
from dotenv import dotenv_values

from app.runtime_paths import get_runtime_paths, prepare_runtime_environment

SUPPORTED_SEARCH_PROVIDERS = {"duckduckgo", "searxng", "tavily"}
DEFAULT_SEARXNG_BASE_URL = "http://localhost:8080"
DEFAULT_TAVILY_API_URL = "https://api.tavily.com/search"
_DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]
_CONFIG_WRITE_LOCK = Lock()


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _write_text_atomic(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(f"{path.suffix}.tmp")
    temp_path.write_text(content, encoding="utf-8")
    temp_path.replace(path)


def _write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    _write_text_atomic(path, json.dumps(payload, ensure_ascii=False, indent=2))


def _sqlite_url(path: Path, driver: str = "sqlite+aiosqlite") -> str:
    return f"{driver}:///{path.resolve().as_posix()}"


def _normalize_database_url(value: str, *, runtime_root: Path) -> str:
    candidate = (value or "").strip()
    if not candidate:
        return _sqlite_url(runtime_root / "elenchus.db")
    sqlite_prefixes = (
        "sqlite+aiosqlite:///./",
        "sqlite:///./",
    )
    for prefix in sqlite_prefixes:
        if candidate.startswith(prefix):
            relative_path = candidate[len(prefix) :]
            driver = "sqlite+aiosqlite" if candidate.startswith("sqlite+aiosqlite") else "sqlite"
            return _sqlite_url(runtime_root / relative_path, driver=driver)
    return candidate


def _default_config() -> dict[str, Any]:
    runtime_root = get_runtime_paths().runtime_root
    return {
        "schema_version": 1,
        "server": {
            "host": "0.0.0.0",
            "port": 8001,
            "debug": False,
            "cors_origins": list(_DEFAULT_CORS_ORIGINS),
            "database_url": _sqlite_url(runtime_root / "elenchus.db"),
        },
        "auth": {
            "enabled": False,
            "jwt_secret_key": "change-me-in-production",
            "jwt_expire_minutes": 10080,
        },
        "providers": [],
        "debate": {
            "default_max_turns": 5,
            "context_window": {
                "recent_turns_to_keep": 3,
                "enable_summary_compression": True,
            },
        },
        "search": {
            "provider": "duckduckgo",
            "max_results_per_query": 5,
            "searxng": {
                "base_url": DEFAULT_SEARXNG_BASE_URL,
                "api_key": "",
            },
            "tavily": {
                "api_url": DEFAULT_TAVILY_API_URL,
                "api_key": "",
            },
        },
        "logging": {
            "level": "INFO",
            "log_dir": "logs",
            "backup_count": 7,
        },
    }


def _normalize_string_list(value: Any, fallback: list[str]) -> list[str]:
    if isinstance(value, str):
        items = [item.strip() for item in value.split(",") if item.strip()]
        return items or list(fallback)
    if isinstance(value, list):
        items = [str(item).strip() for item in value if str(item).strip()]
        return items or list(fallback)
    return list(fallback)


def _normalize_provider(provider: dict[str, Any]) -> dict[str, Any]:
    created_at = provider.get("created_at") or _utcnow_iso()
    updated_at = provider.get("updated_at") or created_at
    return {
        "id": str(provider.get("id", "") or ""),
        "name": str(provider.get("name", "") or "").strip(),
        "provider_type": str(provider.get("provider_type", "openai") or "openai"),
        "api_key": str(provider.get("api_key", "") or ""),
        "api_base_url": str(provider.get("api_base_url", "") or "") or None,
        "custom_parameters": dict(provider.get("custom_parameters") or {}),
        "models": [str(model) for model in (provider.get("models") or []) if str(model)],
        "is_default": bool(provider.get("is_default", False)),
        "created_at": str(created_at),
        "updated_at": str(updated_at),
    }


def normalize_runtime_config(config: dict[str, Any] | None) -> dict[str, Any]:
    runtime_root = get_runtime_paths().runtime_root
    base = _default_config()
    incoming = dict(config or {})

    server = incoming.get("server") if isinstance(incoming.get("server"), dict) else {}
    base["server"].update({
        "host": str(server.get("host") or base["server"]["host"]),
        "port": int(server.get("port") or base["server"]["port"]),
        "debug": bool(server.get("debug", base["server"]["debug"])),
        "cors_origins": _normalize_string_list(server.get("cors_origins"), base["server"]["cors_origins"]),
        "database_url": _normalize_database_url(
            str(server.get("database_url") or base["server"]["database_url"]),
            runtime_root=runtime_root,
        ),
    })

    auth = incoming.get("auth") if isinstance(incoming.get("auth"), dict) else {}
    base["auth"].update({
        "enabled": bool(auth.get("enabled", base["auth"]["enabled"])),
        "jwt_secret_key": str(auth.get("jwt_secret_key") or base["auth"]["jwt_secret_key"]),
        "jwt_expire_minutes": int(auth.get("jwt_expire_minutes") or base["auth"]["jwt_expire_minutes"]),
    })

    debate = incoming.get("debate") if isinstance(incoming.get("debate"), dict) else {}
    context_window = debate.get("context_window") if isinstance(debate.get("context_window"), dict) else {}
    base["debate"].update({
        "default_max_turns": int(debate.get("default_max_turns") or base["debate"]["default_max_turns"]),
        "context_window": {
            "recent_turns_to_keep": int(
                context_window.get("recent_turns_to_keep")
                or base["debate"]["context_window"]["recent_turns_to_keep"]
            ),
            "enable_summary_compression": bool(
                context_window.get(
                    "enable_summary_compression",
                    base["debate"]["context_window"]["enable_summary_compression"],
                )
            ),
        },
    })

    search = incoming.get("search") if isinstance(incoming.get("search"), dict) else {}
    searxng = search.get("searxng") if isinstance(search.get("searxng"), dict) else {}
    tavily = search.get("tavily") if isinstance(search.get("tavily"), dict) else {}
    provider = str(search.get("provider") or base["search"]["provider"]).strip().lower()
    if provider not in SUPPORTED_SEARCH_PROVIDERS:
        provider = base["search"]["provider"]
    base["search"] = {
        "provider": provider,
        "max_results_per_query": int(search.get("max_results_per_query") or base["search"]["max_results_per_query"]),
        "searxng": {
            "base_url": str(searxng.get("base_url") or base["search"]["searxng"]["base_url"]),
            "api_key": str(searxng.get("api_key") or ""),
        },
        "tavily": {
            "api_url": str(tavily.get("api_url") or base["search"]["tavily"]["api_url"]),
            "api_key": str(tavily.get("api_key") or ""),
        },
    }

    logging = incoming.get("logging") if isinstance(incoming.get("logging"), dict) else {}
    base["logging"] = {
        "level": str(logging.get("level") or base["logging"]["level"]).upper(),
        "log_dir": str(logging.get("log_dir") or base["logging"]["log_dir"]),
        "backup_count": int(logging.get("backup_count") or base["logging"]["backup_count"]),
    }

    providers = incoming.get("providers")
    if isinstance(providers, list):
        normalized_providers = [
            normalized
            for provider_item in providers
            if isinstance(provider_item, dict)
            for normalized in [_normalize_provider(provider_item)]
            if normalized["id"] and normalized["name"]
        ]
        if normalized_providers:
            if not any(provider_item.get("is_default") for provider_item in normalized_providers):
                normalized_providers[0]["is_default"] = True
            base["providers"] = normalized_providers

    schema_version = incoming.get("schema_version")
    if isinstance(schema_version, int) and schema_version > 0:
        base["schema_version"] = schema_version

    return base


def _load_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def _load_yaml(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except (OSError, yaml.YAMLError):
        return {}
    return payload if isinstance(payload, dict) else {}


def _load_log_level(path: Path) -> str | None:
    payload = _load_json(path)
    if not payload:
        return None
    level = payload.get("level")
    if not isinstance(level, str) or not level.strip():
        return None
    return level.strip().upper()


def _load_legacy_env(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    values = dotenv_values(path)
    return {str(key): str(value).strip() for key, value in values.items() if value is not None}


def _import_legacy_provider_records() -> list[dict[str, Any]]:
    try:
        from app.services.provider_service import decrypt_legacy_api_key
    except Exception:
        return []

    database_url = _normalize_database_url(
        str(
            _load_legacy_env(get_runtime_paths().env_file).get("DATABASE_URL")
            or _default_config()["server"]["database_url"]
        ),
        runtime_root=get_runtime_paths().runtime_root,
    )
    sqlite_prefixes = ("sqlite+aiosqlite:///", "sqlite:///")
    database_path: Path | None = None
    for prefix in sqlite_prefixes:
        if database_url.startswith(prefix):
            database_path = Path(database_url[len(prefix) :])
            break
    if database_path is None or not database_path.exists():
        return []

    try:
        connection = sqlite3.connect(database_path)
        connection.row_factory = sqlite3.Row
    except sqlite3.Error:
        return []

    try:
        columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(providers)").fetchall()
        }
        if not columns:
            return []

        order_by = "is_default DESC, created_at DESC" if "is_default" in columns and "created_at" in columns else "rowid DESC"
        rows = connection.execute(f"SELECT * FROM providers ORDER BY {order_by}").fetchall()
        providers: list[dict[str, Any]] = []
        for row in rows:
            provider = {
                "id": row["id"] if "id" in columns else "",
                "name": row["name"] if "name" in columns else "",
                "provider_type": row["provider_type"] if "provider_type" in columns else "openai",
                "api_key": decrypt_legacy_api_key(row["api_key_encrypted"] if "api_key_encrypted" in columns else None),
                "api_base_url": row["api_base_url"] if "api_base_url" in columns else None,
                "custom_parameters": json.loads(row["custom_parameters"] or "{}")
                if "custom_parameters" in columns and row["custom_parameters"]
                else {},
                "models": json.loads(row["models"] or "[]")
                if "models" in columns and row["models"]
                else [],
                "is_default": bool(row["is_default"]) if "is_default" in columns else False,
                "created_at": row["created_at"] if "created_at" in columns and row["created_at"] else _utcnow_iso(),
                "updated_at": row["updated_at"] if "updated_at" in columns and row["updated_at"] else _utcnow_iso(),
            }
            if provider["id"] and provider["name"]:
                providers.append(provider)
        return providers
    except (sqlite3.Error, json.JSONDecodeError, TypeError, ValueError):
        return []
    finally:
        connection.close()


def _load_legacy_env_config() -> dict[str, str]:
    paths = get_runtime_paths()
    current = _load_legacy_env(paths.env_file)
    legacy = _load_legacy_env(paths.legacy_env_file)
    merged = dict(legacy)
    merged.update(current)
    return merged


def _load_legacy_yaml_config() -> dict[str, Any]:
    paths = get_runtime_paths()
    current = _load_yaml(paths.config_file)
    legacy = _load_yaml(paths.config_source)
    merged = dict(legacy)
    merged.update(current)
    return merged


def _load_legacy_log_level_config() -> str | None:
    paths = get_runtime_paths()
    return _load_log_level(paths.log_config_file) or _load_log_level(paths.log_config_source)


def _build_initial_runtime_config() -> dict[str, Any]:
    paths = get_runtime_paths()
    yaml_config = _load_legacy_yaml_config()
    env_config = _load_legacy_env_config()
    legacy_log_level = _load_legacy_log_level_config()

    config = _default_config()
    search_cfg = yaml_config.get("search") if isinstance(yaml_config.get("search"), dict) else {}
    debate_cfg = yaml_config.get("debate") if isinstance(yaml_config.get("debate"), dict) else {}

    config["providers"] = _import_legacy_provider_records()
    config["server"].update(
        {
            "host": env_config.get("HOST") or config["server"]["host"],
            "port": int(env_config.get("PORT") or config["server"]["port"]),
            "debug": str(env_config.get("DEBUG") or "false").strip().lower() == "true",
            "cors_origins": _normalize_string_list(env_config.get("CORS_ORIGINS"), config["server"]["cors_origins"]),
            "database_url": _normalize_database_url(
                env_config.get("DATABASE_URL") or config["server"]["database_url"],
                runtime_root=paths.runtime_root,
            ),
        }
    )
    config["search"] = {
        "provider": str(search_cfg.get("provider") or config["search"]["provider"]).strip().lower(),
        "max_results_per_query": int(search_cfg.get("max_results_per_query") or config["search"]["max_results_per_query"]),
        "searxng": {
            "base_url": env_config.get("SEARXNG_BASE_URL") or config["search"]["searxng"]["base_url"],
            "api_key": env_config.get("SEARXNG_API_KEY") or "",
        },
        "tavily": {
            "api_url": env_config.get("TAVILY_API_URL") or config["search"]["tavily"]["api_url"],
            "api_key": env_config.get("TAVILY_API_KEY") or "",
        },
    }
    config["debate"] = {
        "default_max_turns": int(debate_cfg.get("default_max_turns") or config["debate"]["default_max_turns"]),
        "context_window": {
            "recent_turns_to_keep": int(
                ((debate_cfg.get("context_window") or {}) if isinstance(debate_cfg.get("context_window"), dict) else {}).get("recent_turns_to_keep")
                or config["debate"]["context_window"]["recent_turns_to_keep"]
            ),
            "enable_summary_compression": bool(
                ((debate_cfg.get("context_window") or {}) if isinstance(debate_cfg.get("context_window"), dict) else {}).get(
                    "enable_summary_compression",
                    config["debate"]["context_window"]["enable_summary_compression"],
                )
            ),
        },
    }
    if legacy_log_level:
        config["logging"]["level"] = legacy_log_level
    return normalize_runtime_config(config)


def _build_legacy_import_config() -> dict[str, Any]:
    return _build_initial_runtime_config()


def _current_or_initial_runtime_config() -> dict[str, Any]:
    current = _load_json(get_runtime_paths().config_json_file)
    if current is not None:
        return normalize_runtime_config(current)
    return _build_initial_runtime_config()


def ensure_runtime_config() -> dict[str, Any]:
    prepare_runtime_environment()
    path = get_runtime_paths().config_json_file
    with _CONFIG_WRITE_LOCK:
        current = _load_json(path)
        if current is not None:
            normalized = normalize_runtime_config(current)
            if normalized != current:
                _write_json_atomic(path, normalized)
            return normalized

        imported = _build_initial_runtime_config()
        _write_json_atomic(path, imported)
        return imported


def load_runtime_config() -> dict[str, Any]:
    return deepcopy(ensure_runtime_config())


def save_runtime_config(config: dict[str, Any]) -> dict[str, Any]:
    normalized = normalize_runtime_config(config)
    with _CONFIG_WRITE_LOCK:
        _write_json_atomic(get_runtime_paths().config_json_file, normalized)
    return deepcopy(normalized)


def update_runtime_config(mutator) -> dict[str, Any]:
    with _CONFIG_WRITE_LOCK:
        current = _current_or_initial_runtime_config()
        updated = mutator(deepcopy(current))
        normalized = normalize_runtime_config(updated if isinstance(updated, dict) else current)
        _write_json_atomic(get_runtime_paths().config_json_file, normalized)
    return deepcopy(normalized)


def reset_runtime_config_cache() -> None:
    return None


def read_runtime_section(section: str) -> Any:
    return deepcopy(load_runtime_config().get(section))
