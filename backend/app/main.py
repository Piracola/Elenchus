"""
FastAPI application entry point.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.api.sessions import router as sessions_router
from app.api.websocket import router as ws_router
from app.api.models import router as models_router
from app.api.log import router as log_router
from app.api.search import router as search_router
from app.api.search import build_search_health_payload
from app.api.searxng import router as searxng_router
from app.db.database import init_db
from app.dependencies import get_search_factory
from app.services.log_service import setup_logging, get_logger

settings = get_settings()
setup_logging(level=settings.logging.level, log_dir=settings.logging.log_dir)
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup / shutdown lifecycle."""
    logger.info("Elenchus starting up...")
    await init_db()
    logger.info("Database initialized.")
    yield
    # Cleanup search provider resources
    search_factory = get_search_factory()
    await search_factory.close()
    logger.info("Elenchus shut down.")


frontend_dist_dir = settings.frontend_dist_dir
frontend_index_file = frontend_dist_dir / "index.html"
frontend_reserved_roots = {"api", "docs", "redoc", "openapi.json", "health"}

app = FastAPI(
    title="Elenchus",
    description="Multi-Agent Debate Framework — REST & WebSocket API",
    version="1.0.0",
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
app.include_router(searxng_router, prefix="/api")


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
    payload = await build_search_health_payload(search_factory)
    if payload["status"] == "unavailable":
        return {
            **payload,
            "message": "No search provider is reachable.",
        }
    return payload


def _is_reserved_frontend_path(path: str) -> bool:
    normalized = path.strip("/")
    if not normalized:
        return False
    return normalized.split("/", 1)[0] in frontend_reserved_roots


def _resolve_frontend_path(path: str) -> Path | None:
    requested = (frontend_dist_dir / path).resolve()
    try:
        requested.relative_to(frontend_dist_dir.resolve())
    except ValueError:
        return None
    return requested


if frontend_index_file.exists():
    frontend_assets_dir = frontend_dist_dir / "assets"
    if frontend_assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=frontend_assets_dir), name="frontend-assets")

    logger.info("Frontend release bundle detected at %s", frontend_dist_dir)

    @app.get("/", include_in_schema=False)
    async def serve_frontend_index():
        return FileResponse(frontend_index_file)


    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_frontend(full_path: str):
        if _is_reserved_frontend_path(full_path):
            raise HTTPException(status_code=404, detail="Not found")

        requested = _resolve_frontend_path(full_path)
        if requested is not None and requested.is_file():
            return FileResponse(requested)

        if Path(full_path).suffix:
            raise HTTPException(status_code=404, detail="Not found")

        return FileResponse(frontend_index_file)
else:
    logger.info(
        "Frontend release bundle not found at %s; API-only mode is active.",
        frontend_dist_dir,
    )
