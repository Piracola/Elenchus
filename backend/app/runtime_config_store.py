from __future__ import annotations

import json
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any

from app.context_runtime import (
    DEFAULT_CONTEXT_INJECTION_MODE,
    infer_context_injection_mode,
    values_for_context_injection_mode,
)
from app.runtime_paths import get_runtime_paths, prepare_runtime_environment

SUPPORTED_SEARCH_PROVIDERS = {"ddgs", "duckduckgo", "custom"}
SEARCH_PROVIDER_ALIASES = {"duckduckgo": "ddgs"}
_DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]
_CONFIG_WRITE_LOCK = Lock()


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_search_provider_name(value: str) -> str:
    normalized = (value or "").strip().lower()
    if normalized in SEARCH_PROVIDER_ALIASES:
        return SEARCH_PROVIDER_ALIASES[normalized]
    return normalized


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
            "database_url": _normalize_database_url("", runtime_root=runtime_root),
        },
        "providers": [],
        "debate": {
            "default_max_turns": 5,
            "default_max_tokens": 64000,
            "context_runtime": {
                "context_injection_mode": DEFAULT_CONTEXT_INJECTION_MODE,
                "recent_turns_to_include": 2,
                "evidence_items_per_agent": 4,
                "exact_recent_entries_per_agent": 4,
                "planning_entries_per_agent": 2,
                "long_term_memory_entries_per_agent": 4,
                "use_low_cost_context_model": True,
                "low_cost_model_provider_id": "",
                "low_cost_model_id": "",
            },
        },
        "search": {
            "provider": "ddgs",
            "max_results_per_query": 5,
            "custom": {
                "endpoint": "",
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
    raw_default_max_tokens = provider.get("default_max_tokens")
    default_max_tokens = int(raw_default_max_tokens) if raw_default_max_tokens is not None else 64000
    if default_max_tokens < 1:
        default_max_tokens = 64000
    
    # 处理 custom_parameters，支持 enable_thinking 字段
    custom_parameters = dict(provider.get("custom_parameters") or {})
    # 如果顶层有 enable_thinking 字段，将其合并到 custom_parameters 中
    if "enable_thinking" in provider:
        custom_parameters["enable_thinking"] = bool(provider["enable_thinking"])
    
    return {
        "id": str(provider.get("id", "") or ""),
        "name": str(provider.get("name", "") or "").strip(),
        "provider_type": str(provider.get("provider_type", "openai") or "openai"),
        "api_key": str(provider.get("api_key", "") or ""),
        "api_base_url": str(provider.get("api_base_url", "") or "") or None,
        "default_max_tokens": default_max_tokens,
        "custom_parameters": custom_parameters,
        "models": [str(model) for model in (provider.get("models") or []) if str(model)],
        "is_default": bool(provider.get("is_default", False)),
        "created_at": str(created_at),
        "updated_at": str(updated_at),
    }


def _fill_context_runtime_model_from_providers(config: dict[str, Any]) -> None:
    debate = config.get("debate")
    if not isinstance(debate, dict):
        return

    context_runtime = debate.get("context_runtime")
    if not isinstance(context_runtime, dict):
        return

    provider_id = str(context_runtime.get("low_cost_model_provider_id") or "").strip()
    model_id = str(context_runtime.get("low_cost_model_id") or "").strip()
    if not provider_id or model_id:
        return

    providers = config.get("providers")
    if not isinstance(providers, list):
        return

    for provider in providers:
        if not isinstance(provider, dict):
            continue
        if str(provider.get("id") or "") != provider_id:
            continue
        models = provider.get("models")
        if isinstance(models, list):
            first_model = next((str(model).strip() for model in models if str(model).strip()), "")
            if first_model:
                context_runtime["low_cost_model_id"] = first_model
        return


def _decrypt_provider_keys(providers: list[dict[str, Any]] | None) -> None:
    from app.crypto import decrypt_value
    if not providers:
        return
    for p in providers:
        if isinstance(p, dict) and p.get("api_key"):
            p["api_key"] = decrypt_value(str(p["api_key"]))


def _encrypt_provider_keys(providers: list[dict[str, Any]] | None) -> None:
    from app.crypto import encrypt_value
    if not providers:
        return
    for p in providers:
        if isinstance(p, dict) and p.get("api_key"):
            p["api_key"] = encrypt_value(str(p["api_key"]))


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
            str(server.get("database_url") or ""),
            runtime_root=runtime_root,
        ),
    })

    debate = incoming.get("debate") if isinstance(incoming.get("debate"), dict) else {}
    context_runtime = debate.get("context_runtime") if isinstance(debate.get("context_runtime"), dict) else {}
    context_injection_mode = infer_context_injection_mode(context_runtime)
    context_policy_values = values_for_context_injection_mode(
        context_injection_mode,
        context_runtime,
    )
    base["debate"].update({
        "default_max_turns": int(debate.get("default_max_turns") or base["debate"]["default_max_turns"]),
        "context_runtime": {
            "context_injection_mode": context_injection_mode,
            **context_policy_values,
            "use_low_cost_context_model": bool(
                context_runtime.get(
                    "use_low_cost_context_model",
                    base["debate"]["context_runtime"]["use_low_cost_context_model"],
                )
            ),
            "low_cost_model_provider_id": str(
                context_runtime.get("low_cost_model_provider_id")
                or base["debate"]["context_runtime"]["low_cost_model_provider_id"]
            ),
            "low_cost_model_id": str(
                context_runtime.get("low_cost_model_id")
                if context_runtime.get("low_cost_model_id") is not None
                else base["debate"]["context_runtime"]["low_cost_model_id"]
            ),
        },
    })

    search = incoming.get("search") if isinstance(incoming.get("search"), dict) else {}
    custom = search.get("custom") if isinstance(search.get("custom"), dict) else {}
    provider = normalize_search_provider_name(
        str(search.get("provider") or base["search"]["provider"])
    )
    if provider not in SUPPORTED_SEARCH_PROVIDERS:
        provider = base["search"]["provider"]
    base["search"] = {
        "provider": provider,
        "max_results_per_query": int(search.get("max_results_per_query") or base["search"]["max_results_per_query"]),
        "custom": {
            "endpoint": str(custom.get("endpoint") or ""),
            "api_key": str(custom.get("api_key") or ""),
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
            _decrypt_provider_keys(normalized_providers)
            base["providers"] = normalized_providers

    _fill_context_runtime_model_from_providers(base)

    schema_version = incoming.get("schema_version")
    if isinstance(schema_version, int) and schema_version > 0:
        base["schema_version"] = schema_version

    return base


def _load_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def _current_or_initial_runtime_config() -> dict[str, Any]:
    current = _load_json(get_runtime_paths().config_json_file)
    if current is not None:
        return normalize_runtime_config(current)
    return _default_config()


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

        initial = _default_config()
        _write_json_atomic(path, initial)
        return deepcopy(initial)


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
        _encrypt_provider_keys(normalized.get("providers"))
        _write_json_atomic(get_runtime_paths().config_json_file, normalized)
        # Return decrypted copy for in-memory use
        _decrypt_provider_keys(normalized.get("providers"))
    return deepcopy(normalized)


def reset_runtime_config_cache() -> None:
    return None


def read_runtime_section(section: str) -> Any:
    return deepcopy(load_runtime_config().get(section))
