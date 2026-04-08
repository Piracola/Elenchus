"""
Admin authentication API routes for demo mode.
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.config import get_settings
from app.middleware.admin_auth import hash_password, is_valid_admin_token, login, logout
from app.middleware.rate_limit import check_rate_limit

router = APIRouter(prefix="/api/admin", tags=["admin"])


class AdminLoginRequest(BaseModel):
    username: str
    password: str


class AdminLoginResponse(BaseModel):
    token: str
    is_admin: bool = True


class AdminStatusResponse(BaseModel):
    demo_mode: bool
    is_admin: bool
    password_set: bool


@router.post("/login", response_model=AdminLoginResponse)
async def admin_login(req: AdminLoginRequest, request: Request):
    """Authenticate as admin to bypass demo restrictions."""
    ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(ip, "admin_login"):
        raise HTTPException(status_code=429, detail="Too many login attempts. Please try again later.")

    token = login(req.username, req.password)
    if not token:
        raise HTTPException(status_code=401, detail="Invalid admin credentials")

    return AdminLoginResponse(token=token)


@router.post("/logout")
async def admin_logout(request: Request):
    """Revoke the current admin token."""
    auth_header = request.headers.get("authorization", "")
    token = _extract_token(auth_header)
    if not token:
        token = request.query_params.get("admin_token")

    if token:
        logout(token)
    return {"status": "ok"}


@router.get("/status", response_model=AdminStatusResponse)
async def admin_status(request: Request):
    """Check demo mode status and admin authentication state."""
    settings = get_settings()
    auth_header = request.headers.get("authorization", "")
    token = _extract_token(auth_header) or request.query_params.get("admin_token")

    return AdminStatusResponse(
        demo_mode=settings.demo.enabled,
        is_admin=bool(token and is_valid_admin_token(token)),
        password_set=bool(settings.demo.admin_password_hash),
    )


@router.post("/set-password")
async def set_admin_password(request: Request):
    """Update the admin password (requires current admin access)."""
    auth_header = request.headers.get("authorization", "")
    token = _extract_token(auth_header) or request.query_params.get("admin_token")
    if not token or not is_valid_admin_token(token):
        raise HTTPException(status_code=403, detail="Admin access required")

    body = await request.json()
    new_password = body.get("password", "").strip()
    if not new_password:
        raise HTTPException(status_code=400, detail="Password cannot be empty")

    hashed = hash_password(new_password)
    settings = get_settings()
    settings.demo.admin_password_hash = hashed
    # Note: this only updates the in-memory settings. To persist, update runtime/config.json manually.
    return {"status": "ok"}


def _extract_token(header: str) -> str | None:
    if header.startswith("Bearer "):
        return header[7:].strip()
    return None
