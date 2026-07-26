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
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import get_settings
from app.db import database as db_module

# Import db utils (formerly models) for utility functions.
from app.db import db_utils as _models  # noqa: F401
from app.db.database import Base
from app.dependencies import clear_dependency_cache
from app.models import ledger as _ledger_models  # noqa: F401
from app.runtime_paths import get_runtime_paths
from app.services.run_ledger_service import RunLedgerService


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


@pytest_asyncio.fixture(autouse=True)
async def db_session(runtime_dir) -> None:
    """Wire every test to a clean SQLite ledger database."""
    database_path = runtime_dir / "test-ledger.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{database_path.as_posix()}", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, expire_on_commit=False)
    previous_engine = db_module._engine
    previous_factory = db_module._session_factory
    db_module._engine = engine
    db_module._session_factory = factory

    from app.services import (  # noqa: PLC0415
        builtin_reference_service,
        document_service,
        run_service,
        session_service,
    )
    from app.services.run_projector_service import RunProjectorService  # noqa: PLC0415

    previous_ledgers = {
        session_service: session_service._ledger,  # noqa: SLF001
        run_service: run_service._ledger,  # noqa: SLF001
        document_service: document_service._ledger,  # noqa: SLF001
        builtin_reference_service: builtin_reference_service._ledger,  # noqa: SLF001
    }
    previous_projectors = {
        run_service: run_service._projector,  # noqa: SLF001
    }
    test_ledger = RunLedgerService(factory)
    for module in previous_ledgers:
        module._ledger = test_ledger  # noqa: SLF001
    test_projector = RunProjectorService(factory)
    for module in previous_projectors:
        module._projector = test_projector  # noqa: SLF001
    clear_dependency_cache()

    try:
        yield
    finally:
        clear_dependency_cache()
        for module, previous_ledger in previous_ledgers.items():
            module._ledger = previous_ledger  # noqa: SLF001
        for module, previous_projector in previous_projectors.items():
            module._projector = previous_projector  # noqa: SLF001
        db_module._engine = previous_engine
        db_module._session_factory = previous_factory

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await engine.dispose()
