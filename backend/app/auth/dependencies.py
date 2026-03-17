"""
FastAPI dependencies for authentication.

Provides optional authentication mode - when AUTH_ENABLED is false,
authentication is bypassed and all users are treated as anonymous.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import decode_access_token
from app.config import get_settings
from app.db.database import get_db
from app.db.models import UserRecord

# Bearer token security scheme
security = HTTPBearer(auto_error=False)


async def _get_user_from_token(
    token: str | None,
    db: AsyncSession,
) -> UserRecord | None:
    """
    Internal helper to extract user from JWT token.

    Args:
        token: JWT token string (without 'Bearer ' prefix)
        db: Database session

    Returns:
        UserRecord if valid token and active user, None otherwise
    """
    if not token:
        return None

    payload = decode_access_token(token)
    if not payload:
        return None

    user_id: str | None = payload.get("sub")
    if not user_id:
        return None

    # Fetch user from database
    stmt = select(UserRecord).where(UserRecord.id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if user and user.is_active:
        return user

    return None


async def get_current_user_optional(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(security),
    ] = None,
    db: AsyncSession = Depends(get_db),
) -> UserRecord | None:
    """
    Get current user if authenticated, None otherwise.

    This dependency does NOT enforce authentication - it's used for
    optional auth mode where anonymous access is allowed.

    Use this when you want to:
    - Allow anonymous access when auth is disabled
    - Get user info if available but not require it

    Returns:
        UserRecord if authenticated, None if not
    """
    settings = get_settings()

    # If auth is disabled, return None (anonymous mode)
    if not settings.env.auth_enabled:
        return None

    # Auth is enabled - validate token
    if not credentials:
        return None

    return await _get_user_from_token(credentials.credentials, db)


async def get_current_user(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(security),
    ] = None,
    db: AsyncSession = Depends(get_db),
) -> UserRecord | None:
    """
    Get current user, raising 401 if not authenticated.

    This dependency enforces authentication when AUTH_ENABLED is true.
    When AUTH_ENABLED is false, it returns None (anonymous mode).

    Raises:
        HTTPException: 401 if auth is enabled but token is missing/invalid

    Returns:
        UserRecord if authenticated, None if auth is disabled
    """
    settings = get_settings()

    if not settings.env.auth_enabled:
        return None

    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await _get_user_from_token(credentials.credentials, db)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


async def get_current_user_ws(
    token: Annotated[str | None, Query(alias="token")] = None,
    db: AsyncSession = Depends(get_db),
) -> UserRecord | None:
    """
    WebSocket-specific authentication dependency.

    WebSocket connections cannot use Authorization headers,
    so we accept the token as a query parameter.

    Args:
        token: JWT token passed as query parameter
        db: Database session

    Returns:
        UserRecord if authenticated, None otherwise
    """
    settings = get_settings()

    # If auth is disabled, return None (anonymous mode)
    if not settings.env.auth_enabled:
        return None

    return await _get_user_from_token(token, db)


# Type aliases for cleaner injection
OptionalUser = Annotated[UserRecord | None, Depends(get_current_user_optional)]
CurrentUser = Annotated[UserRecord | None, Depends(get_current_user)]
WebSocketUser = Annotated[UserRecord | None, Depends(get_current_user_ws)]
