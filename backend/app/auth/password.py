"""
Password hashing and verification using bcrypt.
"""

from __future__ import annotations

from passlib.context import CryptContext

# bcrypt-based password context
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """
    Hash a plain-text password using bcrypt.

    Args:
        password: Plain-text password string

    Returns:
        Hashed password string
    """
    return _pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain-text password against a hashed password.

    Args:
        plain_password: Plain-text password to verify
        hashed_password: Previously hashed password to compare against

    Returns:
        True if password matches, False otherwise
    """
    return _pwd_context.verify(plain_password, hashed_password)
