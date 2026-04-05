"""
SearXNG local deployment management API.
Provides endpoints to check and control SearXNG Docker container lifecycle.
"""

from __future__ import annotations

import logging
import platform
import shutil
import subprocess
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/searxng", tags=["searxng"])

SEARXNG_URL = "http://localhost:8080"


def _find_project_root() -> Path | None:
    """Find the project root directory."""
    current = Path(__file__).resolve().parent
    for parent in current.parents:
        if (parent / "searxng" / "docker-compose.yml").exists():
            return parent
        if (parent / "docker-compose.yml").exists():
            return parent
    return None


def _is_docker_available() -> bool:
    """Check if Docker is installed and available."""
    return shutil.which("docker") is not None


def _run_docker_compose_command(args: list[str], timeout: int = 30) -> tuple[bool, str]:
    """Run a docker compose command and return success status and output."""
    root = _find_project_root()
    if not root:
        return False, "Project root not found"

    docker_compose_file = root / "searxng" / "docker-compose.yml"
    if not docker_compose_file.exists():
        docker_compose_file = root / "docker-compose.yml"
    
    if not docker_compose_file.exists():
        return False, "docker-compose.yml not found"

    try:
        cmd = ["docker", "compose", "-f", str(docker_compose_file)] + args
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=str(root),
        )
        if result.returncode != 0:
            return False, result.stderr or "Command failed"
        return True, result.stdout
    except subprocess.TimeoutExpired:
        return False, "Command timed out"
    except Exception as e:
        return False, str(e)


class SearXNGStatusResponse(BaseModel):
    docker_available: bool
    searxng_running: bool
    searxng_healthy: bool
    searxng_url: str


class SearXNGActionResponse(BaseModel):
    success: bool
    message: str


async def _check_searxng_health() -> bool:
    """Check if SearXNG is healthy and responding."""
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(f"{SEARXNG_URL}/healthz")
            return response.status_code == 200
    except Exception:
        return False


async def _check_searxng_running() -> bool:
    """Check if SearXNG container is running."""
    success, output = _run_docker_compose_command(["ps", "--format", "{{.Names}}"])
    if not success:
        return False
    return "elenchus-searxng" in output


@router.get("/status", response_model=SearXNGStatusResponse)
async def get_searxng_status() -> SearXNGStatusResponse:
    """Get the current status of SearXNG deployment."""
    docker_available = _is_docker_available()
    running = await _check_searxng_running() if docker_available else False
    healthy = await _check_searxng_health() if docker_available else False

    return SearXNGStatusResponse(
        docker_available=docker_available,
        searxng_running=running,
        searxng_healthy=healthy,
        searxng_url=SEARXNG_URL,
    )


@router.post("/start", response_model=SearXNGActionResponse)
async def start_searxng() -> SearXNGActionResponse:
    """Start SearXNG Docker container."""
    if not _is_docker_available():
        return SearXNGActionResponse(
            success=False,
            message="Docker is not installed. Please install Docker Desktop first.",
        )

    # Check if already running
    if await _check_searxng_running():
        if await _check_searxng_health():
            return SearXNGActionResponse(
                success=True,
                message="SearXNG is already running and healthy",
            )

    # Start SearXNG (非阻塞式启动)
    import subprocess
    import threading
    
    def start_in_background():
        try:
            _run_docker_compose_command(["up", "-d"], timeout=30)
        except Exception as e:
            logger.error(f"Background SearXNG start failed: {e}")
    
    # 在后台线程启动，立即返回
    thread = threading.Thread(target=start_in_background)
    thread.start()
    
    return SearXNGActionResponse(
        success=True,
        message="SearXNG 正在启动中，请等待片刻后刷新状态查看...",
    )


@router.post("/stop", response_model=SearXNGActionResponse)
async def stop_searxng() -> SearXNGActionResponse:
    """Stop SearXNG Docker container."""
    if not _is_docker_available():
        return SearXNGActionResponse(
            success=False,
            message="Docker is not installed",
        )

    if not await _check_searxng_running():
        return SearXNGActionResponse(
            success=True,
            message="SearXNG is not running",
        )

    success, output = _run_docker_compose_command(["down"], timeout=30)
    if not success:
        logger.error(f"Failed to stop SearXNG: {output}")
        return SearXNGActionResponse(
            success=False,
            message=f"Failed to stop SearXNG: {output}",
        )

    return SearXNGActionResponse(
        success=True,
        message="SearXNG stopped successfully",
    )
