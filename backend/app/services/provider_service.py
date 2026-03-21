"""
Provider configuration service with database persistence.
API keys are encrypted using Fernet symmetric encryption.
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
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_session_factory
from app.db.models import ProviderRecord
from app.models.schemas import ModelConfigCreate, ModelConfigUpdate, ModelConfigResponse
from app.runtime_paths import get_runtime_paths

logger = logging.getLogger(__name__)

_ENCRYPTION_ENV_KEY = "ELENCHUS_ENCRYPTION_KEY"
_ENCRYPTION_PLACEHOLDER = "replace-with-a-generated-key"


def _backend_env_path() -> Path:
    return get_runtime_paths().env_file


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


def ensure_local_encryption_key(env_file: Path | None = None) -> str:
    """
    Ensure a valid local encryption key exists.

    Behavior:
    - If the process environment already contains a valid key, use it.
    - If `.env` contains a valid key, load it into the process environment.
    - If the key is missing or still uses the template placeholder, generate one,
      persist it to `.env`, and export it to the current process.
    - If a non-placeholder invalid key is present, raise an error instead of
      silently overwriting it, because doing so could orphan previously
      encrypted provider API keys.
    """
    current_key = _normalize_key(os.environ.get(_ENCRYPTION_ENV_KEY))
    if _is_valid_fernet_key(current_key):
        return current_key

    if current_key and current_key != _ENCRYPTION_PLACEHOLDER:
        raise ValueError(
            f"{_ENCRYPTION_ENV_KEY} is set but invalid. "
            "Refusing to replace it automatically because that could make "
            "existing encrypted provider API keys undecryptable."
        )

    env_path = env_file or _backend_env_path()
    file_values = dotenv_values(env_path) if env_path.exists() else {}
    stored_key = _normalize_key(file_values.get(_ENCRYPTION_ENV_KEY))

    if _is_valid_fernet_key(stored_key):
        os.environ[_ENCRYPTION_ENV_KEY] = stored_key
        return stored_key

    if stored_key and stored_key != _ENCRYPTION_PLACEHOLDER:
        raise ValueError(
            f"{_ENCRYPTION_ENV_KEY} in {env_path} is invalid. "
            "Refusing to overwrite it automatically because that could break "
            "decryption of existing provider API keys."
        )

    generated_key = Fernet.generate_key().decode()
    env_path.parent.mkdir(parents=True, exist_ok=True)
    if not env_path.exists():
        env_path.touch()
    set_key(str(env_path), _ENCRYPTION_ENV_KEY, generated_key, quote_mode="never")
    os.environ[_ENCRYPTION_ENV_KEY] = generated_key
    logger.info("Generated local provider encryption key at %s", env_path)
    return generated_key


def _get_encryption_key() -> bytes:
    """Get Fernet encryption key, generating a local one on first startup."""
    return ensure_local_encryption_key().encode()


def _get_fernet() -> Fernet:
    """Get Fernet instance for encryption/decryption."""
    return Fernet(_get_encryption_key())


class ProviderService:
    """Async service for managing LLM provider configurations."""

    def _encrypt_api_key(self, api_key: str | None) -> str | None:
        """Encrypt API key for storage."""
        if not api_key:
            return None
        return _get_fernet().encrypt(api_key.encode()).decode()

    def _decrypt_api_key(self, encrypted: str | None) -> str | None:
        """Decrypt API key from storage."""
        if not encrypted:
            return None
        try:
            return _get_fernet().decrypt(encrypted.encode()).decode()
        except Exception as exc:
            logger.error("Failed to decrypt API key: %s", exc)
            return None

    def _record_to_response(self, record: ProviderRecord) -> ModelConfigResponse:
        """Convert database record to response model."""
        return ModelConfigResponse(
            id=record.id,
            name=record.name,
            provider_type=record.provider_type,
            api_key=self._decrypt_api_key(record.api_key_encrypted),
            api_base_url=record.api_base_url,
            custom_parameters=record.custom_parameters or {},
            models=record.models or [],
            is_default=record.is_default,
            created_at=record.created_at,
            updated_at=record.updated_at,
        )

    def _record_to_dict(self, record: ProviderRecord) -> dict[str, Any]:
        """Convert database record to raw dict (with decrypted api_key)."""
        return {
            "id": record.id,
            "name": record.name,
            "provider_type": record.provider_type,
            "api_key": self._decrypt_api_key(record.api_key_encrypted),
            "api_base_url": record.api_base_url,
            "custom_parameters": record.custom_parameters or {},
            "models": record.models or [],
            "is_default": record.is_default,
            "created_at": record.created_at,
            "updated_at": record.updated_at,
        }

    async def _get_session(self) -> AsyncSession:
        """Get async database session."""
        factory = get_session_factory()
        return factory()

    async def list_configs(self) -> list[ModelConfigResponse]:
        """List all provider configurations."""
        async with await self._get_session() as session:
            result = await session.execute(
                select(ProviderRecord).order_by(
                    ProviderRecord.is_default.desc(),
                    ProviderRecord.created_at.desc(),
                )
            )
            records = result.scalars().all()
            return [self._record_to_response(record) for record in records]

    async def list_configs_raw(self) -> list[dict[str, Any]]:
        """Return raw dicts with decrypted api_key for internal server-side use."""
        async with await self._get_session() as session:
            result = await session.execute(select(ProviderRecord))
            records = result.scalars().all()
            return [self._record_to_dict(record) for record in records]

    async def get_default_config(self) -> ModelConfigResponse | None:
        """Get the default provider configuration."""
        async with await self._get_session() as session:
            result = await session.execute(
                select(ProviderRecord).where(ProviderRecord.is_default)
            )
            record = result.scalar_one_or_none()
            if record:
                return self._record_to_response(record)
            return None

    async def create_config(self, config_in: ModelConfigCreate) -> ModelConfigResponse:
        """Create a new provider configuration."""
        async with await self._get_session() as session:
            existing = await session.execute(
                select(ProviderRecord).where(ProviderRecord.name == config_in.name)
            )
            if existing.scalar_one_or_none():
                raise ValueError("A model configuration with this name already exists.")

            count_result = await session.execute(select(ProviderRecord))
            existing_count = len(count_result.scalars().all())
            make_default = config_in.is_default or existing_count == 0

            if make_default:
                await self._clear_defaults(session)

            now = datetime.now(timezone.utc)
            record = ProviderRecord(
                id=str(uuid.uuid4()),
                name=config_in.name,
                provider_type=config_in.provider_type,
                api_key_encrypted=self._encrypt_api_key(config_in.api_key),
                api_base_url=config_in.api_base_url,
                custom_parameters=config_in.custom_parameters or {},
                models=config_in.models,
                is_default=make_default,
                created_at=now,
                updated_at=now,
            )
            session.add(record)
            await session.commit()
            await session.refresh(record)
            return self._record_to_response(record)

    async def update_config(
        self, config_id: str, config_in: ModelConfigUpdate
    ) -> ModelConfigResponse | None:
        """Update an existing provider configuration."""
        async with await self._get_session() as session:
            result = await session.execute(
                select(ProviderRecord).where(ProviderRecord.id == config_id)
            )
            record = result.scalar_one_or_none()
            if not record:
                return None

            update_data = config_in.model_dump(exclude_unset=True)

            if update_data.get("is_default") is True:
                await self._clear_defaults(session)

            if "name" in update_data:
                record.name = update_data["name"]
            if "provider_type" in update_data:
                record.provider_type = update_data["provider_type"]
            if "api_key" in update_data:
                record.api_key_encrypted = self._encrypt_api_key(update_data["api_key"])
            if "api_base_url" in update_data:
                record.api_base_url = update_data["api_base_url"]
            if "custom_parameters" in update_data:
                record.custom_parameters = update_data["custom_parameters"] or {}
            if "models" in update_data:
                record.models = update_data["models"]
            if "is_default" in update_data:
                record.is_default = update_data["is_default"]

            record.updated_at = datetime.now(timezone.utc)
            await session.commit()
            await session.refresh(record)
            return self._record_to_response(record)

    async def delete_config(self, config_id: str) -> bool:
        """Delete a provider configuration."""
        async with await self._get_session() as session:
            result = await session.execute(
                select(ProviderRecord).where(ProviderRecord.id == config_id)
            )
            record = result.scalar_one_or_none()
            if not record:
                return False

            was_default = record.is_default
            await session.delete(record)

            if was_default:
                result = await session.execute(
                    select(ProviderRecord)
                    .where(ProviderRecord.id != config_id)
                    .order_by(ProviderRecord.created_at.desc())
                )
                new_default = result.scalar_first()
                if new_default:
                    new_default.is_default = True

            await session.commit()
            return True

    async def _clear_defaults(self, session: AsyncSession) -> None:
        """Clear all default flags in the current session."""
        result = await session.execute(
            select(ProviderRecord).where(ProviderRecord.is_default)
        )
        for record in result.scalars().all():
            record.is_default = False
