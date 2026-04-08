"""
Demo mode request guard.

When demo_mode is enabled, blocks all mutation endpoints unless the request
carries a valid admin token. Read-only (GET) endpoints are always allowed.
"""

from __future__ import annotations

import re
from collections.abc import Awaitable, Callable

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import get_settings
from app.middleware.admin_auth import is_valid_admin_token

# Patterns for endpoints that are safe to expose in demo mode.
_ALLOWED_PATTERNS = [
    # Health endpoints
    (r"^/health", None),
    (r"^/api/health", None),
    # Session CRUD (read + create allowed; delete blocked below)
    (r"^/api/sessions$", {"GET", "POST"}),
    # Session detail and export (read-only)
    (r"^/api/sessions/[^/]+$", {"GET"}),
    (r"^/api/sessions/[^/]+/export", {"GET"}),
    # Session documents (upload allowed for reference)
    (r"^/api/sessions/[^/]+/documents", None),
    # Session runtime events (read-only)
    (r"^/api/sessions/[^/]+/runtime-events", {"GET"}),
    # Session control (start/stop/intervene/status)
    (r"^/api/sessions/[^/]+/(start|stop|intervene|status|live-events)", None),
    # WebSocket upgrade
    (r"^/api/ws/", None),
    # Mode query (read-only, needed by frontend to detect demo state)
    (r"^/api/mode", {"GET"}),
    # Admin auth endpoints (login/logout/status)
    (r"^/api/admin/", None),
]

_BLOCKED_METHODS_FOR_DEMO = {"POST", "PUT", "DELETE", "PATCH"}


class DemoGuardMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        settings = get_settings()
        if not settings.demo.enabled:
            return await call_next(request)

        # Admin token bypass
        auth_header = request.headers.get("authorization", "")
        token = _extract_token_from_header(auth_header) or request.query_params.get("admin_token")
        if token and is_valid_admin_token(token):
            return await call_next(request)

        path = request.url.path
        method = request.method.upper()

        # GET is always allowed in demo mode
        if method == "GET":
            return await call_next(request)

        # Check if this path+method is in the demo whitelist
        if _is_path_allowed(path, method):
            return await call_next(request)

        # Otherwise block
        return JSONResponse(
            status_code=403,
            content={"error": "Demo mode: this operation is not allowed. Log in as admin for full access."},
        )


def _extract_token_from_header(header: str) -> str | None:
    if header.startswith("Bearer "):
        return header[7:].strip()
    return None


def _is_path_allowed(path: str, method: str) -> bool:
    for pattern, allowed_methods in _ALLOWED_PATTERNS:
        if re.match(pattern, path):
            if allowed_methods is None:
                return True
            return method in allowed_methods
    return False
