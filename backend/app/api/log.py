"""
Log settings API endpoints.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.audit import log_audit
from app.middleware.auth import require_auth
from app.services.log_service import get_log_manager, LogLevel

router = APIRouter(prefix="/log", tags=["log"])


@router.get("/level")
async def get_log_level():
    """Get current log level."""
    manager = get_log_manager()
    return {"level": manager.get_level().to_string()}


@router.put("/level")
async def set_log_level(data: dict, _auth: bool = Depends(require_auth)):
    """Set log level dynamically."""
    level_str = data.get("level", "INFO").upper()
    new_level = LogLevel.from_string(level_str)
    manager = get_log_manager()
    manager.set_level(new_level)
    log_audit("log_level_change", payload={"level": level_str})
    return {"level": new_level.to_string()}


@router.get("/levels")
async def list_log_levels():
    """List all available log levels."""
    return {
        "levels": ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
        "current": get_log_manager().get_level().to_string(),
    }
