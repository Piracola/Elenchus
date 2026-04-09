"""
Pytest fixtures for Elenchus backend tests.

Tests use an in-memory SQLite database and temporarily wire the app-level
session factory to that database so services that rely on global dependencies
still stay isolated.
"""

from __future__ import annotations

import asyncio
import shutil
import uuid
from pathlib import Path

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings
from app.db import database as db_module
from app.db.database import Base
from app.dependencies import clear_dependency_cache
from app.runtime_paths import get_runtime_paths

# Import db utils (formerly models) for utility functions.
from app.db import db_utils as _models  # noqa: F401

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(autouse=True)
def runtime_dir(monkeypatch):
    base_dir = Path(__file__).resolve().parents[1] / "test_runtime"
    base_dir.mkdir(parents=True, exist_ok=True)
    runtime_root = base_dir / f"runtime-{uuid.uuid4().hex}"
    runtime_root.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("ELENCHUS_RUNTIME_DIR", str(runtime_root))
    get_runtime_paths.cache_clear()
    get_settings.cache_clear()
    clear_dependency_cache()
    try:
        yield runtime_root
    finally:
        clear_dependency_cache()
        get_settings.cache_clear()
        get_runtime_paths.cache_clear()
        shutil.rmtree(runtime_root, ignore_errors=True)


@pytest_asyncio.fixture(scope="function")
async def db_session() -> AsyncSession:
    """Provide a clean in-memory DB session for each test."""
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, expire_on_commit=False)
    previous_engine = db_module._engine
    previous_factory = db_module._session_factory
    db_module._engine = engine
    db_module._session_factory = factory
    clear_dependency_cache()

    try:
        async with factory() as session:
            yield session
    finally:
        clear_dependency_cache()
        db_module._engine = previous_engine
        db_module._session_factory = previous_factory

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await engine.dispose()
