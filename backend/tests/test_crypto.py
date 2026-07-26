from __future__ import annotations

from cryptography.fernet import Fernet

from app import crypto
from app.runtime_paths import get_runtime_paths


def _reset(monkeypatch, *, env_key: str | None = None) -> None:
    if env_key is None:
        monkeypatch.delenv("ELENCHUS_ENCRYPTION_KEY", raising=False)
    else:
        monkeypatch.setenv("ELENCHUS_ENCRYPTION_KEY", env_key)
    crypto.reset_crypto_cache()


def test_auto_generates_and_persists_key_when_env_missing(monkeypatch):
    _reset(monkeypatch)

    ciphertext = crypto.encrypt_value("sk-secret")

    key_file = get_runtime_paths().runtime_root / "encryption.key"
    assert key_file.exists()
    assert ciphertext != "sk-secret"
    assert ciphertext.startswith("gAAAA")
    assert crypto.decrypt_value(ciphertext) == "sk-secret"


def test_reuses_persisted_key_across_cache_resets(monkeypatch):
    _reset(monkeypatch)
    ciphertext = crypto.encrypt_value("sk-secret")

    # Simulate process restart: cache cleared, key file still on disk.
    crypto.reset_crypto_cache()
    assert crypto.decrypt_value(ciphertext) == "sk-secret"


def test_env_key_takes_priority_over_key_file(monkeypatch):
    env_key = Fernet.generate_key().decode()
    key_file = get_runtime_paths().runtime_root / "encryption.key"
    key_file.parent.mkdir(parents=True, exist_ok=True)
    key_file.write_text(Fernet.generate_key().decode() + "\n", encoding="utf-8")

    _reset(monkeypatch, env_key=env_key)

    ciphertext = crypto.encrypt_value("sk-secret")
    assert Fernet(env_key.encode()).decrypt(ciphertext.encode()).decode() == "sk-secret"


def test_legacy_plaintext_passthrough(monkeypatch):
    _reset(monkeypatch)

    # Values stored before encryption was enabled decrypt to themselves.
    assert crypto.decrypt_value("sk-legacy-plaintext") == "sk-legacy-plaintext"


def test_invalid_env_key_falls_back_to_plaintext(monkeypatch):
    _reset(monkeypatch, env_key="not-a-valid-fernet-key")

    assert crypto.encrypt_value("sk-secret") == "sk-secret"
    assert crypto.decrypt_value("sk-secret") == "sk-secret"


def test_empty_values_are_untouched(monkeypatch):
    _reset(monkeypatch)

    assert crypto.encrypt_value("") == ""
    assert crypto.decrypt_value("") == ""
