#!/usr/bin/env python3
"""
Smoke-test the release backend startup lifecycle.

This validates that the runtime dependencies listed in backend/requirements.txt
are sufficient for a packaged release to finish FastAPI startup and shutdown.
"""

from __future__ import annotations

import asyncio
import os
import shutil
import sys
from pathlib import Path

from cryptography.fernet import Fernet

ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT / "backend"
FRONTEND_DIST_DIR = ROOT / "frontend" / "dist"
SMOKE_DIR = ROOT / "dist" / "release-smoke"


def configure_runtime_environment() -> None:
    SMOKE_DIR.mkdir(parents=True, exist_ok=True)
    db_path = (SMOKE_DIR / "elenchus-smoke.db").resolve().as_posix()

    # Avoid mutating backend/.env during CI or local smoke runs.
    os.environ.setdefault("ELENCHUS_ENCRYPTION_KEY", Fernet.generate_key().decode())
    os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    os.environ.setdefault("DEBUG", "false")


async def run_smoke_test() -> None:
    configure_runtime_environment()
    sys.path.insert(0, str(BACKEND_DIR))

    from app.main import app

    async with app.router.lifespan_context(app):
        pass


def main() -> int:
    if not FRONTEND_DIST_DIR.joinpath("index.html").exists():
        raise FileNotFoundError(
            "frontend/dist/index.html is missing. Build the frontend before running this smoke test."
        )

    if SMOKE_DIR.exists():
        shutil.rmtree(SMOKE_DIR)

    try:
        asyncio.run(run_smoke_test())
        print("Release backend smoke test passed.")
        return 0
    finally:
        if SMOKE_DIR.exists():
            shutil.rmtree(SMOKE_DIR)


if __name__ == "__main__":
    raise SystemExit(main())
