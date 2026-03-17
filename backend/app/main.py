"""
FastAPI application entry point.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.api.sessions import router as sessions_router
from app.api.websocket import router as ws_router, manager as ws_manager
from app.api.models import router as models_router
from app.api.log import router as log_router
from app.api.search import router as search_router
from app.db.database import init_db
from app.dependencies import get_search_factory
from app.services.log_service import setup_logging, get_logger
from app.agents.events import set_broadcaster

setup_logging(level="DEBUG" if get_settings().env.debug else "INFO", log_dir="logs")
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup / shutdown lifecycle."""
    logger.info("Elenchus starting up...")
    await init_db()
    set_broadcaster(ws_manager)
    logger.info("Database initialized. Event broadcaster configured.")
    yield
    # Cleanup search provider resources
    search_factory = get_search_factory()
    await search_factory.close()
    logger.info("Elenchus shut down.")


settings = get_settings()

app = FastAPI(
    title="Elenchus",
    description="Multi-Agent Debate Framework — REST & WebSocket API",
    version="0.1.0",
    debug=settings.env.debug,
    lifespan=lifespan,
)

# CORS — configurable via CORS_ORIGINS env var
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.env.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(sessions_router, prefix="/api")
app.include_router(ws_router, prefix="/api")
app.include_router(models_router, prefix="/api/models", tags=["models"])
app.include_router(log_router, prefix="/api")
app.include_router(search_router, prefix="/api")


# ── Health / diagnostic endpoints ────────────────────────────────

@app.get("/health")
@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "elenchus"}


@app.get("/health/search")
@app.get("/api/health/search")
async def search_health():
    """Check which search provider is available."""
    search_factory = get_search_factory()
    provider = await search_factory.get_provider()
    if provider is None:
        return {
            "status": "unavailable",
            "provider": None,
            "message": "No search provider is reachable.",
        }
    return {
        "status": "ok",
        "provider": provider.__class__.__name__,
    }
