"""
Admin authentication API routes for demo mode.
"""

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.config import get_settings
from app.middleware.admin_auth import hash_password, is_valid_admin_token, login, logout
from app.audit import log_audit
from app.middleware.rate_limit import consume_rate_limit

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


def _rate_limit_payload(detail: str, decision: Any) -> dict[str, Any]:
    return {
        "detail": detail,
        "rate_limit": decision.as_metadata(),
    }


@router.post("/login", response_model=AdminLoginResponse)
async def admin_login(req: AdminLoginRequest, request: Request):
    """Authenticate as admin to bypass demo restrictions."""
    ip = request.client.host if request.client else "unknown"
    decision = consume_rate_limit(ip, "admin_login")
    if not decision.allowed:
        return JSONResponse(
            status_code=429,
            content=_rate_limit_payload(
                "Too many login attempts. Please try again later.",
                decision,
            ),
            headers=decision.as_headers(),
        )

    token = login(req.username, req.password)
    if not token:
        log_audit("admin_login_failed", ip=ip, user=req.username)
        raise HTTPException(status_code=401, detail="Invalid admin credentials")

    log_audit("admin_login_success", ip=ip, user=req.username)

    response = AdminLoginResponse(token=token)
    json_response = JSONResponse(content=response.model_dump())
    json_response.set_cookie(
        key="elenchus_admin_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="strict",
        max_age=24 * 3600,
    )
    return json_response


@router.post("/logout")
async def admin_logout(request: Request):
    """Revoke the current admin token."""
    auth_header = request.headers.get("authorization", "")
    token = _extract_token(auth_header)
    if not token:
        token = request.cookies.get("elenchus_admin_token") or request.query_params.get("admin_token")

    ip = request.client.host if request.client else "unknown"
    if token:
        logout(token)
        log_audit("admin_logout", ip=ip)

    json_response = JSONResponse(content={"status": "ok"})
    json_response.delete_cookie(key="elenchus_admin_token")
    return json_response


@router.get("/status", response_model=AdminStatusResponse)
async def admin_status(request: Request):
    """Check demo mode status and admin authentication state."""
    settings = get_settings()
    auth_header = request.headers.get("authorization", "")
    token = _extract_token(auth_header) or request.cookies.get("elenchus_admin_token") or request.query_params.get("admin_token")

    return AdminStatusResponse(
        demo_mode=settings.demo.enabled,
        is_admin=bool(token and is_valid_admin_token(token)),
        password_set=bool(settings.demo.admin_password_hash),
    )


@router.post("/set-password")
async def set_admin_password(request: Request):
    """Update the admin password (requires current admin access)."""
    auth_header = request.headers.get("authorization", "")
    token = _extract_token(auth_header) or request.cookies.get("elenchus_admin_token") or request.query_params.get("admin_token")
    if not token or not is_valid_admin_token(token):
        raise HTTPException(status_code=403, detail="Admin access required")

    body = await request.json()
    new_password = body.get("password", "").strip()
    if not new_password:
        raise HTTPException(status_code=400, detail="Password cannot be empty")

    hashed = hash_password(new_password)
    settings = get_settings()
    settings.demo.admin_password_hash = hashed
    from app.runtime_config_store import update_runtime_config
    update_runtime_config(lambda cfg: cfg.update({"demo": {**cfg.get("demo", {}), "admin_password_hash": hashed}}))

    ip = request.client.host if request.client else "unknown"
    log_audit("admin_set_password", ip=ip)
    return {"status": "ok"}


def _extract_token(header: str) -> str | None:
    if header.startswith("Bearer "):
        return header[7:].strip()
    return None
