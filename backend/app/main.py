"""
FastAPI application entry point.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.api.sessions import router as sessions_router
from app.api.websocket import router as ws_router
from app.db.database import init_db
from app.search.factory import SearchProviderFactory

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup / shutdown lifecycle."""
    logger.info("Elenchus starting up...")
    await init_db()
    logger.info("Database initialized.")
    yield
    # Shutdown
    await SearchProviderFactory.close()
    logger.info("Elenchus shut down.")


settings = get_settings()

app = FastAPI(
    title="Elenchus",
    description="Multi-Agent Debate Framework — REST & WebSocket API",
    version="0.1.0",
    debug=settings.env.debug,
    lifespan=lifespan,
)

# CORS — allow the Vite dev server during development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(sessions_router, prefix="/api")
app.include_router(ws_router, prefix="/api")


# ── Health / diagnostic endpoints ────────────────────────────────

@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "elenchus"}


@app.get("/health/search")
async def search_health():
    """Check which search provider is available."""
    provider = await SearchProviderFactory.get_provider()
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
