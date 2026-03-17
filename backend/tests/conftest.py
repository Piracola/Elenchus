"""
Pytest fixtures for Elenchus backend tests.

Tests use an in-memory SQLite database and temporarily wire the app-level
session factory to that database so services that rely on global dependencies
still stay isolated.
"""

from __future__ import annotations

import asyncio

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db import database as db_module
from app.db.database import Base
from app.dependencies import clear_dependency_cache

# Import models so Base.metadata includes every table before create_all.
from app.db import models as _models  # noqa: F401

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


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
