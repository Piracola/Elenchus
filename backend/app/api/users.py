"""
User authentication and management API.

Provides endpoints for:
- User registration
- User login (JWT token generation)
- Current user info retrieval
- Authentication status check
"""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import OptionalUser, get_current_user_optional
from app.auth.jwt import create_access_token
from app.auth.password import hash_password, verify_password
from app.config import get_settings
from app.db.database import get_db
from app.db.models import UserRecord, _utcnow
from app.models.schemas import (
    AuthStatusResponse,
    TokenResponse,
    UserLogin,
    UserRegister,
    UserResponse,
)

router = APIRouter(prefix="/users", tags=["users"])


# ── Registration ──────────────────────────────────────────────────

@router.post("/register", response_model=UserResponse, status_code=201)
async def register(
    body: UserRegister,
    db: AsyncSession = Depends(get_db),
):
    """
    Register a new user account.

    Returns the created user info on success.
    Raises 400 if email is already registered.
    """
    settings = get_settings()

    # Check if auth is enabled
    if not settings.env.auth_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration is disabled. Authentication is not enabled on this server.",
        )

    # Check if email already exists
    stmt = select(UserRecord).where(UserRecord.email == body.email)
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # Create new user
    now = _utcnow()
    user = UserRecord(
        email=body.email,
        password_hash=hash_password(body.password),
        is_active=True,
        is_superuser=False,
        created_at=now,
        updated_at=now,
    )

    db.add(user)
    await db.commit()
    await db.refresh(user)

    return UserResponse(
        id=user.id,
        email=user.email,
        is_active=user.is_active,
        is_superuser=user.is_superuser,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


# ── Login ─────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
async def login(
    body: UserLogin,
    db: AsyncSession = Depends(get_db),
):
    """
    Authenticate user and return JWT token.

    Returns access token on successful authentication.
    Raises 401 if credentials are invalid.
    """
    settings = get_settings()

    # Check if auth is enabled
    if not settings.env.auth_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Login is disabled. Authentication is not enabled on this server.",
        )

    # Find user by email
    stmt = select(UserRecord).where(UserRecord.email == body.email)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    # Validate credentials
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is disabled",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Generate JWT token
    access_token = create_access_token(
        data={"sub": user.id},
        expires_delta=timedelta(minutes=settings.env.jwt_expire_minutes),
    )

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.env.jwt_expire_minutes * 60,
    )


# ── Current User ──────────────────────────────────────────────────

@router.get("/me", response_model=UserResponse)
async def get_current_user_info(user: OptionalUser):
    """
    Get current authenticated user info.

    Raises 401 if not authenticated and auth is enabled.
    Returns user info if authenticated.
    """
    settings = get_settings()

    # If auth is enabled but user is not authenticated
    if settings.env.auth_enabled and not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # If auth is disabled, return a placeholder response
    if not settings.env.auth_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Authentication is not enabled on this server",
        )

    return UserResponse(
        id=user.id,
        email=user.email,
        is_active=user.is_active,
        is_superuser=user.is_superuser,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


# ── Auth Status ───────────────────────────────────────────────────

@router.get("/auth/status", response_model=AuthStatusResponse)
async def get_auth_status(user: OptionalUser):
    """
    Get authentication status.

    Returns whether auth is enabled and current user info if authenticated.
    This endpoint is useful for frontend to check auth configuration.
    """
    settings = get_settings()

    return AuthStatusResponse(
        auth_enabled=settings.env.auth_enabled,
        authenticated=user is not None,
        user=UserResponse(
            id=user.id,
            email=user.email,
            is_active=user.is_active,
            is_superuser=user.is_superuser,
            created_at=user.created_at,
            updated_at=user.updated_at,
        ) if user else None,
    )
