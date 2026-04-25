"""
Admin authentication for demo mode.

Provides token-based authentication that allows admin users to bypass
demo mode restrictions. Uses HMAC-based tokens stored in memory.
Password hashing uses bcrypt with fallback to legacy SHA-256.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
import time

import bcrypt

from app.config import get_settings

logger = logging.getLogger(__name__)

# In-memory store of valid tokens with expiry
_valid_tokens: dict[str, float] = {}
_TOKEN_TTL_SECONDS = 24 * 3600  # 24 hours


def generate_admin_token() -> str:
    """Generate a new admin token and store it."""
    settings = get_settings()
    secret = settings.auth.jwt_secret_key
    raw = secrets.token_hex(32)
    token = _sign_token(raw, secret)
    _valid_tokens[token] = time.time() + _TOKEN_TTL_SECONDS
    _cleanup_expired()
    return token


def validate_admin_credentials(username: str, password: str) -> bool:
    """Check username/password against demo config."""
    settings = get_settings()
    expected_user = settings.demo.admin_username
    expected_hash = settings.demo.admin_password_hash

    if not expected_hash:
        # No password set — reject all login attempts
        return False

    return hmac.compare_digest(username, expected_user) and _verify_password(password, expected_hash)


def login(username: str, password: str) -> str | None:
    """Validate credentials and return admin token, or None on failure."""
    if not validate_admin_credentials(username, password):
        return None
    return generate_admin_token()


def logout(token: str) -> bool:
    """Revoke an admin token."""
    if token in _valid_tokens:
        del _valid_tokens[token]
        return True
    return False


def is_valid_admin_token(token: str) -> bool:
    """Check if a token is valid and not expired."""
    if token not in _valid_tokens:
        return False
    if time.time() > _valid_tokens[token]:
        del _valid_tokens[token]
        return False
    return True


def _sign_token(raw: str, secret: str) -> str:
    """Create an HMAC-signed token."""
    signature = hmac.new(secret.encode(), raw.encode(), hashlib.sha256).hexdigest()
    return f"{raw}.{signature}"


def _is_legacy_sha256(stored_hash: str) -> bool:
    """Detect whether stored hash is the old SHA-256 format (64 hex chars)."""
    return len(stored_hash) == 64 and all(c in "0123456789abcdef" for c in stored_hash.lower())


def _verify_password(password: str, stored_hash: str) -> bool:
    """Verify password against stored hash (bcrypt or legacy SHA-256)."""
    if not stored_hash:
        return False
    if _is_legacy_sha256(stored_hash):
        computed = hashlib.sha256(password.encode()).hexdigest()
        return hmac.compare_digest(computed, stored_hash)
    try:
        return bcrypt.checkpw(password.encode(), stored_hash.encode())
    except Exception:
        return False


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _cleanup_expired() -> None:
    """Remove expired tokens."""
    now = time.time()
    expired = [t for t, exp in _valid_tokens.items() if now > exp]
    for t in expired:
        del _valid_tokens[t]
