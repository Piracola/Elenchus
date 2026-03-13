"""
Fernet symmetric encryption for provider API keys.

The master key is read from the PROVIDERS_ENCRYPTION_KEY environment variable.
Generate one with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
"""

import os
from cryptography.fernet import Fernet, InvalidToken

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        key = os.environ.get("PROVIDERS_ENCRYPTION_KEY", "")
        if not key:
            raise RuntimeError(
                "PROVIDERS_ENCRYPTION_KEY is not set. "
                "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )
        _fernet = Fernet(key.encode())
    return _fernet


def encrypt_key(plaintext: str) -> str:
    """Encrypt an API key, returning a base64 ciphertext string."""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_key(ciphertext: str) -> str:
    """Decrypt a ciphertext API key back to plaintext."""
    try:
        return _get_fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken as e:
        raise ValueError("Failed to decrypt API key — wrong PROVIDERS_ENCRYPTION_KEY?") from e


def is_encrypted(value: str) -> bool:
    """Heuristic: Fernet tokens start with 'gAAAAA'."""
    return value.startswith("gAAAAA")
