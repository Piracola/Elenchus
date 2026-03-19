"""
SQLAlchemy async engine & session setup.
"""

from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""
    pass


_engine = None
_session_factory = None


def _get_engine():
    global _engine
    if _engine is None:
        settings = get_settings()
        _engine = create_async_engine(
            settings.env.database_url,
            echo=settings.env.debug,
        )
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            _get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
        )
    return _session_factory


async def get_db() -> AsyncSession:
    """FastAPI dependency — yields an async DB session."""
    factory = get_session_factory()
    async with factory() as session:
        yield session


async def init_db():
    """Create all tables on startup."""
    engine = _get_engine()
    async with engine.begin() as conn:
        import app.db.models  # noqa: F401

        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_run_schema_migrations)


def _run_schema_migrations(sync_conn) -> None:
    """Apply lightweight additive schema migrations for existing local databases."""
    inspector = inspect(sync_conn)
    if "providers" not in inspector.get_table_names():
        return

    provider_columns = {column["name"] for column in inspector.get_columns("providers")}
    if "custom_parameters" not in provider_columns:
        sync_conn.execute(text("ALTER TABLE providers ADD COLUMN custom_parameters JSON"))
