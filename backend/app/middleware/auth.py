"""
Global authentication dependency for Elenchus.

When auth.enabled is true in runtime/config.json, mutation endpoints and
WebSocket connections require a valid admin token (Bearer or Cookie).
Read-only GET endpoints remain public by design.
"""

from __future__ import annotations

from fastapi import HTTPException, Request, status
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import get_settings
from app.middleware.admin_auth import is_valid_admin_token


def _extract_bearer(header: str) -> str | None:
    if header.startswith("Bearer "):
        return header[7:].strip()
    return None


def _get_token_from_request(request: Request) -> str | None:
    """Extract token from Authorization header or httpOnly cookie."""
    auth_header = request.headers.get("authorization", "")
    token = _extract_bearer(auth_header)
    if not token:
        token = request.cookies.get("elenchus_admin_token")
    return token


class AuthRequired:
    """FastAPI dependency that enforces authentication when auth.enabled is true."""

    def __call__(self, request: Request) -> bool:
        settings = get_settings()
        if not settings.auth.enabled:
            return True

        token = _get_token_from_request(request)
        if token and is_valid_admin_token(token):
            return True

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )


require_auth = AuthRequired()


class AuthMiddleware(BaseHTTPMiddleware):
    """
    Optional middleware that blocks unauthenticated mutation requests globally.
    GET/HEAD/OPTIONS are always allowed. Other methods require a valid token
    when auth.enabled is true.
    """

    async def dispatch(self, request: Request, call_next):
        settings = get_settings()
        if not settings.auth.enabled:
            return await call_next(request)

        if request.method in ("GET", "HEAD", "OPTIONS"):
            return await call_next(request)

        token = _get_token_from_request(request)
        if token and is_valid_admin_token(token):
            return await call_next(request)

        from fastapi.responses import JSONResponse

        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": "Authentication required"},
            headers={"WWW-Authenticate": "Bearer"},
        )
