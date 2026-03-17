"""
Migration script: Migrate providers from JSON file to database.

Usage:
    cd backend
    python -m scripts.migrate_providers_to_db
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path

from cryptography.fernet import Fernet

# Add parent directory to path for imports
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings
from app.db.database import get_session_factory, init_db
from app.db.models import ProviderRecord

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

PROVIDERS_FILE = get_settings().project_root / "data" / "providers.json"


def _get_encryption_key() -> bytes:
    """Get or generate Fernet encryption key from environment."""
    key = os.environ.get("ELENCHUS_ENCRYPTION_KEY")
    if not key:
        key = Fernet.generate_key().decode()
        os.environ["ELENCHUS_ENCRYPTION_KEY"] = key
        logger.warning(
            "ELENCHUS_ENCRYPTION_KEY not set. Generated a new key. "
            "Set this environment variable for production."
        )
    return key.encode() if isinstance(key, str) else key


def _encrypt_api_key(api_key: str | None) -> str | None:
    """Encrypt API key for storage."""
    if not api_key:
        return None
    return Fernet(_get_encryption_key()).encrypt(api_key.encode()).decode()


def parse_datetime(dt_str: str) -> datetime:
    """Parse datetime string from JSON format."""
    # Handle format: "2024-01-15T10:30:00.123Z"
    if dt_str.endswith("Z"):
        dt_str = dt_str[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(dt_str)
    except ValueError:
        return datetime.now(timezone.utc)


async def migrate_providers():
    """Migrate providers from JSON file to database."""
    # Initialize database (create tables if needed)
    await init_db()
    logger.info("Database initialized.")

    # Check if JSON file exists
    if not PROVIDERS_FILE.exists():
        logger.info(f"No providers.json file found at {PROVIDERS_FILE}. Nothing to migrate.")
        return

    # Read JSON data
    try:
        with open(PROVIDERS_FILE, "r", encoding="utf-8") as f:
            providers_data = json.load(f)
    except (json.JSONDecodeError, FileNotFoundError) as e:
        logger.error(f"Failed to read providers.json: {e}")
        return

    if not isinstance(providers_data, list):
        logger.error("providers.json does not contain a list. Aborting.")
        return

    if not providers_data:
        logger.info("providers.json is empty. Nothing to migrate.")
        return

    logger.info(f"Found {len(providers_data)} provider(s) to migrate.")

    # Get database session
    factory = get_session_factory()

    async with factory() as session:
        # Check if providers already exist in database
        from sqlalchemy import select
        result = await session.execute(select(ProviderRecord))
        existing = result.scalars().all()

        if existing:
            logger.warning(f"Database already contains {len(existing)} provider(s). Skipping migration.")
            logger.info("If you want to re-migrate, please clear the providers table first.")
            return

        # Migrate each provider
        migrated_count = 0
        for item in providers_data:
            try:
                # Parse timestamps
                created_at = parse_datetime(item.get("created_at", ""))
                updated_at = parse_datetime(item.get("updated_at", ""))

                record = ProviderRecord(
                    id=item.get("id", ""),
                    name=item.get("name", ""),
                    provider_type=item.get("provider_type", "openai"),
                    api_key_encrypted=_encrypt_api_key(item.get("api_key")),
                    api_base_url=item.get("api_base_url"),
                    models=item.get("models", []),
                    is_default=item.get("is_default", False),
                    created_at=created_at,
                    updated_at=updated_at,
                )
                session.add(record)
                migrated_count += 1
                logger.info(f"Migrated provider: {record.name}")
            except Exception as e:
                logger.error(f"Failed to migrate provider {item.get('name', 'unknown')}: {e}")

        await session.commit()
        logger.info(f"Successfully migrated {migrated_count} provider(s) to database.")

    # Backup original JSON file
    backup_path = PROVIDERS_FILE.with_suffix(".json.bak")
    if not backup_path.exists():
        shutil.copy2(PROVIDERS_FILE, backup_path)
        logger.info(f"Original file backed up to: {backup_path}")
    else:
        logger.info(f"Backup already exists at: {backup_path}")

    logger.info("Migration completed successfully!")


def main():
    """Main entry point."""
    logger.info("=" * 60)
    logger.info("Provider Migration Script: JSON -> Database")
    logger.info("=" * 60)

    asyncio.run(migrate_providers())


if __name__ == "__main__":
    main()
