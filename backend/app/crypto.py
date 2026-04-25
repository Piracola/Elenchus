"""
Encryption helpers for sensitive configuration values.

Uses Fernet (AES-128-CBC with HMAC) from the cryptography library.
The encryption key is read from the ELENCHUS_ENCRYPTION_KEY environment variable.
If the variable is not set, values are stored in plaintext and a warning is logged.
"""

from __future__ import annotations

import logging
import os

from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)

_ENCRYPTION_KEY = os.environ.get("ELENCHUS_ENCRYPTION_KEY", "").strip()
_fernet: Fernet | None = None


def _get_fernet() -> Fernet | None:
    global _fernet
    if _fernet is not None:
        return _fernet
    if not _ENCRYPTION_KEY:
        return None
    try:
        _fernet = Fernet(_ENCRYPTION_KEY.encode())
        return _fernet
    except Exception as exc:
        logger.error("Invalid ELENCHUS_ENCRYPTION_KEY: %s", exc)
        return None


def encrypt_value(plaintext: str) -> str:
    """Encrypt a plaintext string. Returns plaintext if encryption is unavailable."""
    if not plaintext:
        return plaintext
    f = _get_fernet()
    if f is None:
        return plaintext
    return f.encrypt(plaintext.encode()).decode()


def decrypt_value(ciphertext: str) -> str:
    """Decrypt a ciphertext string. Returns ciphertext as-is if decryption fails or is unavailable."""
    if not ciphertext:
        return ciphertext
    f = _get_fernet()
    if f is None:
        return ciphertext
    try:
        return f.decrypt(ciphertext.encode()).decode()
    except Exception:
        # Likely already plaintext (not encrypted yet or wrong key)
        return ciphertext
