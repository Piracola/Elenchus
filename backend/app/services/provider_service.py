"""
Provider configuration service backed by runtime/config.json.
Legacy Fernet helpers are retained only for one-time imports from the old
providers database.
"""

from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet
from dotenv import dotenv_values, set_key

from app.models.schemas import ModelConfigCreate, ModelConfigResponse, ModelConfigUpdate
from app.runtime_config_store import load_runtime_config, update_runtime_config
from app.runtime_paths import get_runtime_paths

logger = logging.getLogger(__name__)

_ENCRYPTION_ENV_KEY = "ELENCHUS_ENCRYPTION_KEY"
_ENCRYPTION_PLACEHOLDER = "replace-with-a-generated-key"


def _normalize_key(candidate: object | None) -> str:
    if candidate is None:
        return ""
    return str(candidate).strip()


def _is_valid_fernet_key(candidate: str) -> bool:
    if not candidate:
        return False
    try:
        Fernet(candidate.encode())
        return True
    except Exception:
        return False


def _legacy_env_candidates(env_file: Path | None = None) -> list[Path]:
    paths = get_runtime_paths()
    if env_file is not None:
        candidates = [env_file]
    else:
        candidates = [paths.env_file, paths.legacy_env_file]
    candidates = [path for path in candidates if path is not None]
    unique: list[Path] = []
    seen: set[str] = set()
    for path in candidates:
        marker = str(path)
        if marker in seen:
            continue
        seen.add(marker)
        unique.append(path)
    return unique


def _load_legacy_encryption_key(env_file: Path | None = None) -> str:
    current_key = _normalize_key(os.environ.get(_ENCRYPTION_ENV_KEY))
    if _is_valid_fernet_key(current_key):
        return current_key

    for candidate in _legacy_env_candidates(env_file):
        if not candidate.exists():
            continue
        file_values = dotenv_values(candidate)
        stored_key = _normalize_key(file_values.get(_ENCRYPTION_ENV_KEY))
        if _is_valid_fernet_key(stored_key):
            return stored_key
    return ""


def ensure_local_encryption_key(env_file: Path | None = None) -> str:
    """Keep legacy Fernet bootstrap behavior for local runtimes and tests."""

    current_key = _normalize_key(os.environ.get(_ENCRYPTION_ENV_KEY))
    if _is_valid_fernet_key(current_key):
        return current_key

    if current_key and current_key != _ENCRYPTION_PLACEHOLDER:
        raise ValueError(
            f"{_ENCRYPTION_ENV_KEY} is set but invalid. "
            "Refusing to replace it automatically because that could make "
            "existing encrypted provider API keys undecryptable."
        )

    for candidate in _legacy_env_candidates(env_file):
        if not candidate.exists():
            continue
        file_values = dotenv_values(candidate)
        stored_key = _normalize_key(file_values.get(_ENCRYPTION_ENV_KEY))
        if _is_valid_fernet_key(stored_key):
            os.environ[_ENCRYPTION_ENV_KEY] = stored_key
            return stored_key
        if stored_key and stored_key != _ENCRYPTION_PLACEHOLDER:
            raise ValueError(
                f"{_ENCRYPTION_ENV_KEY} in {candidate} is invalid. "
                "Refusing to overwrite it automatically because that could break "
                "decryption of existing provider API keys."
            )

    generated_key = Fernet.generate_key().decode()
    target_env = env_file or get_runtime_paths().env_file
    target_env.parent.mkdir(parents=True, exist_ok=True)
    if not target_env.exists():
        target_env.touch()
    set_key(str(target_env), _ENCRYPTION_ENV_KEY, generated_key, quote_mode="never")
    os.environ[_ENCRYPTION_ENV_KEY] = generated_key
    logger.info("Generated local provider encryption key at %s", target_env)
    return generated_key


def get_legacy_encryption_key() -> str:
    """Return the current legacy encryption key without generating a new one."""

    return _load_legacy_encryption_key()


def decrypt_legacy_api_key(encrypted: str | None) -> str | None:
    """Decrypt API keys stored by the legacy DB-backed provider store."""

    if not encrypted:
        return None

    key = get_legacy_encryption_key()
    if not key or key == _ENCRYPTION_PLACEHOLDER:
        return None

    try:
        return Fernet(key.encode()).decrypt(encrypted.encode()).decode()
    except Exception:
        return None


def maybe_decrypt_api_key(value: str | None) -> str | None:
    """Return plaintext if already plaintext; otherwise try legacy Fernet decryption."""

    if not value:
        return None
    if not get_legacy_encryption_key():
        return value
    decrypted = decrypt_legacy_api_key(value)
    return decrypted if decrypted is not None else value


def has_configured_api_key(value: str | None) -> bool:
    return bool(maybe_decrypt_api_key(value))


def normalize_stored_api_key(value: str | None) -> str:
    return maybe_decrypt_api_key(value) or ""


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _parse_timestamp(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    text = str(value or "").strip()
    if text:
        try:
            return datetime.fromisoformat(text)
        except ValueError:
            pass
    return _utcnow()


def _sort_provider_configs(providers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        providers,
        key=lambda provider: (
            bool(provider.get("is_default")),
            _parse_timestamp(provider.get("created_at")),
        ),
        reverse=True,
    )


class ProviderService:
    """Async service for managing LLM provider configurations."""

    @staticmethod
    def _load_provider_configs() -> list[dict[str, Any]]:
        config = load_runtime_config()
        providers = config.get("providers")
        if not isinstance(providers, list):
            return []
        return _sort_provider_configs(
            [dict(provider) for provider in providers if isinstance(provider, dict)]
        )

    @staticmethod
    def _config_to_response(provider: dict[str, Any]) -> ModelConfigResponse:
        return ModelConfigResponse(
            id=str(provider.get("id") or ""),
            name=str(provider.get("name") or ""),
            provider_type=str(provider.get("provider_type") or "openai"),
            api_key_configured=has_configured_api_key(provider.get("api_key")),
            api_base_url=provider.get("api_base_url"),
            custom_parameters=dict(provider.get("custom_parameters") or {}),
            models=[str(model) for model in (provider.get("models") or []) if str(model)],
            is_default=bool(provider.get("is_default", False)),
            created_at=_parse_timestamp(provider.get("created_at")),
            updated_at=_parse_timestamp(provider.get("updated_at")),
        )

    @staticmethod
    def _config_to_dict(provider: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": str(provider.get("id") or ""),
            "name": str(provider.get("name") or ""),
            "provider_type": str(provider.get("provider_type") or "openai"),
            "api_key": maybe_decrypt_api_key(str(provider.get("api_key") or "") or None),
            "api_base_url": provider.get("api_base_url"),
            "custom_parameters": dict(provider.get("custom_parameters") or {}),
            "models": [str(model) for model in (provider.get("models") or []) if str(model)],
            "is_default": bool(provider.get("is_default", False)),
            "created_at": _parse_timestamp(provider.get("created_at")),
            "updated_at": _parse_timestamp(provider.get("updated_at")),
        }

    async def list_configs(self) -> list[ModelConfigResponse]:
        """List all provider configurations."""
        return [
            self._config_to_response(provider)
            for provider in self._load_provider_configs()
        ]

    async def list_configs_raw(self) -> list[dict[str, Any]]:
        """Return raw dicts with plaintext api_key for internal server-side use."""
        return [
            self._config_to_dict(provider)
            for provider in self._load_provider_configs()
        ]

    async def get_default_config(self) -> ModelConfigResponse | None:
        """Get the default provider configuration."""
        for provider in self._load_provider_configs():
            if provider.get("is_default"):
                return self._config_to_response(provider)
        return None

    async def create_config(self, config_in: ModelConfigCreate) -> ModelConfigResponse:
        """Create a new provider configuration."""
        name = config_in.name.strip()
        if not name:
            raise ValueError("Model configuration name cannot be empty.")

        config_id = str(uuid.uuid4())
        created_at = _utcnow().isoformat()

        def mutator(config: dict[str, Any]) -> dict[str, Any]:
            providers = [
                dict(provider)
                for provider in (config.get("providers") or [])
                if isinstance(provider, dict)
            ]
            if any(str(provider.get("name") or "").strip() == name for provider in providers):
                raise ValueError("A model configuration with this name already exists.")

            make_default = bool(config_in.is_default or not providers)
            if make_default:
                for provider in providers:
                    provider["is_default"] = False

            providers.append(
                {
                    "id": config_id,
                    "name": name,
                    "provider_type": config_in.provider_type,
                    "api_key": config_in.api_key or "",
                    "api_base_url": config_in.api_base_url,
                    "custom_parameters": dict(config_in.custom_parameters or {}),
                    "models": list(config_in.models),
                    "is_default": make_default,
                    "created_at": created_at,
                    "updated_at": created_at,
                }
            )
            config["providers"] = providers
            return config

        updated = update_runtime_config(mutator)
        created = next(
            (
                provider
                for provider in updated.get("providers", [])
                if isinstance(provider, dict) and provider.get("id") == config_id
            ),
            None,
        )
        if created is None:
            raise RuntimeError("Failed to persist provider configuration.")
        return self._config_to_response(created)

    async def update_config(
        self,
        config_id: str,
        config_in: ModelConfigUpdate,
    ) -> ModelConfigResponse | None:
        """Update an existing provider configuration."""
        update_data = config_in.model_dump(exclude_unset=True)
        clear_api_key = bool(update_data.pop("clear_api_key", False))

        normalized_name = None
        if "name" in update_data:
            normalized_name = str(update_data["name"] or "").strip()
            if not normalized_name:
                raise ValueError("Model configuration name cannot be empty.")
            update_data["name"] = normalized_name

        def mutator(config: dict[str, Any]) -> dict[str, Any]:
            providers = [
                dict(provider)
                for provider in (config.get("providers") or [])
                if isinstance(provider, dict)
            ]
            target_index = next(
                (index for index, provider in enumerate(providers) if provider.get("id") == config_id),
                None,
            )
            if target_index is None:
                return config

            if normalized_name is not None and any(
                str(provider.get("name") or "").strip() == normalized_name
                and provider.get("id") != config_id
                for provider in providers
            ):
                raise ValueError("A model configuration with this name already exists.")

            provider = dict(providers[target_index])

            if update_data.get("is_default") is True:
                for item in providers:
                    item["is_default"] = False
                provider["is_default"] = True
            elif "is_default" in update_data:
                provider["is_default"] = bool(update_data["is_default"])

            if "name" in update_data:
                provider["name"] = update_data["name"]
            if "provider_type" in update_data and update_data["provider_type"] is not None:
                provider["provider_type"] = update_data["provider_type"]
            if clear_api_key:
                provider["api_key"] = ""
            elif "api_key" in update_data and update_data["api_key"] is not None:
                provider["api_key"] = update_data["api_key"]
            if "api_base_url" in update_data:
                provider["api_base_url"] = update_data["api_base_url"]
            if "custom_parameters" in update_data:
                provider["custom_parameters"] = dict(update_data["custom_parameters"] or {})
            if "models" in update_data:
                provider["models"] = list(update_data["models"] or [])

            provider["updated_at"] = _utcnow().isoformat()
            providers[target_index] = provider
            config["providers"] = providers
            return config

        updated = update_runtime_config(mutator)
        provider = next(
            (
                item
                for item in updated.get("providers", [])
                if isinstance(item, dict) and item.get("id") == config_id
            ),
            None,
        )
        if provider is None:
            return None
        return self._config_to_response(provider)

    async def delete_config(self, config_id: str) -> bool:
        """Delete a provider configuration."""
        deleted = False

        def mutator(config: dict[str, Any]) -> dict[str, Any]:
            nonlocal deleted
            providers = [
                dict(provider)
                for provider in (config.get("providers") or [])
                if isinstance(provider, dict)
            ]
            target = next(
                (provider for provider in providers if provider.get("id") == config_id),
                None,
            )
            if target is None:
                return config

            deleted = True
            remaining = [provider for provider in providers if provider.get("id") != config_id]
            if bool(target.get("is_default")) and remaining:
                promoted = max(
                    remaining,
                    key=lambda provider: _parse_timestamp(provider.get("created_at")),
                )
                for provider in remaining:
                    provider["is_default"] = provider.get("id") == promoted.get("id")
            config["providers"] = remaining
            return config

        update_runtime_config(mutator)
        return deleted
