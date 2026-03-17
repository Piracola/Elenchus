"""
Provider configuration service with database persistence.
API keys are encrypted using Fernet symmetric encryption.
"""

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any

from cryptography.fernet import Fernet
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_session_factory
from app.db.models import ProviderRecord
from app.models.schemas import ModelConfigCreate, ModelConfigUpdate, ModelConfigResponse

logger = logging.getLogger(__name__)


def _get_encryption_key() -> bytes:
    """Get Fernet encryption key from environment.

    Raises:
        ValueError: If ELENCHUS_ENCRYPTION_KEY is not set.

    For development, generate a key with:
        python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    """
    key = os.environ.get("ELENCHUS_ENCRYPTION_KEY")
    if not key:
        raise ValueError(
            "ELENCHUS_ENCRYPTION_KEY environment variable is required. "
            "Generate one with: "
            "python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    return key.encode() if isinstance(key, str) else key


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
        except Exception as e:
            logger.error(f"Failed to decrypt API key: {e}")
            return None

    def _record_to_response(self, record: ProviderRecord, mask_key: bool = True) -> ModelConfigResponse:
        """Convert database record to response model."""
        api_key = self._decrypt_api_key(record.api_key_encrypted)
        if mask_key:
            api_key = self._mask_api_key(api_key)
        return ModelConfigResponse(
            id=record.id,
            name=record.name,
            provider_type=record.provider_type,
            api_key=api_key,
            api_base_url=record.api_base_url,
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
            "models": record.models or [],
            "is_default": record.is_default,
            "created_at": record.created_at,
            "updated_at": record.updated_at,
        }

    @staticmethod
    def _mask_api_key(api_key: str | None) -> str | None:
        """Mask API key for display."""
        if not api_key:
            return api_key
        if len(api_key) <= 8:
            return "****"
        return api_key[:3] + "..." + api_key[-4:]

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
                    ProviderRecord.created_at.desc()
                )
            )
            records = result.scalars().all()
            return [self._record_to_response(r) for r in records]

    async def list_configs_raw(self) -> list[dict[str, Any]]:
        """Return raw dicts with decrypted api_key for internal server-side use."""
        async with await self._get_session() as session:
            result = await session.execute(select(ProviderRecord))
            records = result.scalars().all()
            return [self._record_to_dict(r) for r in records]

    async def get_default_config(self) -> ModelConfigResponse | None:
        """Get the default provider configuration."""
        async with await self._get_session() as session:
            result = await session.execute(
                select(ProviderRecord).where(ProviderRecord.is_default == True)
            )
            record = result.scalar_one_or_none()
            if record:
                return self._record_to_response(record)
            return None

    async def create_config(self, config_in: ModelConfigCreate) -> ModelConfigResponse:
        """Create a new provider configuration."""
        async with await self._get_session() as session:
            # Check for duplicate name
            existing = await session.execute(
                select(ProviderRecord).where(ProviderRecord.name == config_in.name)
            )
            if existing.scalar_one_or_none():
                raise ValueError("A model configuration with this name already exists.")

            # Check if this should be default (first config or explicitly requested)
            count_result = await session.execute(select(ProviderRecord))
            existing_count = len(count_result.scalars().all())
            make_default = config_in.is_default or existing_count == 0

            # Clear existing defaults if needed
            if make_default:
                await self._clear_defaults(session)

            now = datetime.now(timezone.utc)
            record = ProviderRecord(
                id=str(uuid.uuid4()),
                name=config_in.name,
                provider_type=config_in.provider_type,
                api_key_encrypted=self._encrypt_api_key(config_in.api_key),
                api_base_url=config_in.api_base_url,
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

            # Handle is_default update
            if update_data.get("is_default") is True:
                await self._clear_defaults(session)

            # Update fields
            if "name" in update_data:
                record.name = update_data["name"]
            if "provider_type" in update_data:
                record.provider_type = update_data["provider_type"]
            if "api_key" in update_data:
                record.api_key_encrypted = self._encrypt_api_key(update_data["api_key"])
            if "api_base_url" in update_data:
                record.api_base_url = update_data["api_base_url"]
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
            select(ProviderRecord).where(ProviderRecord.is_default == True)
        )
        for record in result.scalars().all():
            record.is_default = False
