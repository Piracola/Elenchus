"""
Encryption helpers for sensitive configuration values.

Uses Fernet (AES-128-CBC with HMAC) from the cryptography library.

Key resolution order:
1. ELENCHUS_ENCRYPTION_KEY environment variable (explicit, highest priority).
2. Auto-managed key file at <runtime_root>/encryption.key. If it does not
   exist, a fresh key is generated and persisted there so provider API keys
   are never silently stored in plaintext.

Values encrypted with an older key remain readable as long as that key is
supplied via the environment variable; decryption failures fall back to
returning the stored value unchanged (legacy plaintext compatibility).
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

from cryptography.fernet import Fernet

from app.runtime_paths import get_runtime_paths

logger = logging.getLogger(__name__)

_KEY_FILE_NAME = "encryption.key"
_fernet: Fernet | None = None
_fernet_resolved = False


def _key_file_path() -> Path:
    return get_runtime_paths().runtime_root / _KEY_FILE_NAME


def _load_or_create_key_file() -> str | None:
    key_file = _key_file_path()
    try:
        if key_file.exists():
            stored = key_file.read_text(encoding="utf-8").strip()
            if stored:
                return stored
        key = Fernet.generate_key().decode()
        key_file.parent.mkdir(parents=True, exist_ok=True)
        key_file.write_text(key + "\n", encoding="utf-8")
        try:
            os.chmod(key_file, 0o600)
        except OSError:
            # Best effort only; Windows ACLs do not map onto POSIX modes.
            pass
        logger.warning(
            "ELENCHUS_ENCRYPTION_KEY is not set; generated a new encryption key at %s. "
            "Back this file up — provider API keys in runtime/config.json cannot be "
            "decrypted without it.",
            key_file,
        )
        return key
    except OSError as exc:
        logger.error(
            "Unable to read or persist encryption key file %s (%s); "
            "provider API keys will be stored in plaintext.",
            key_file,
            exc,
        )
        return None


def _get_fernet() -> Fernet | None:
    global _fernet, _fernet_resolved
    if _fernet_resolved:
        return _fernet
    _fernet_resolved = True

    key = os.environ.get("ELENCHUS_ENCRYPTION_KEY", "").strip()
    if not key:
        key = _load_or_create_key_file() or ""
    if not key:
        return None
    try:
        _fernet = Fernet(key.encode())
    except Exception as exc:
        logger.error("Invalid encryption key: %s", exc)
        _fernet = None
    return _fernet


def reset_crypto_cache() -> None:
    """Reset the cached Fernet instance (used by tests after env/runtime changes)."""
    global _fernet, _fernet_resolved
    _fernet = None
    _fernet_resolved = False


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
        if ciphertext.startswith("gAAAA"):
            # Looks like a Fernet token but failed to decrypt: the key changed.
            logger.warning(
                "Failed to decrypt a stored credential (encryption key mismatch); "
                "re-enter the provider API key in Settings."
            )
        # Otherwise: legacy plaintext stored before encryption was enabled.
        return ciphertext
