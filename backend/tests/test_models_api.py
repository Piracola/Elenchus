from __future__ import annotations

from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from app.main import app


def test_create_model_config_without_trailing_slash(
    db_session,
    monkeypatch,
):
    monkeypatch.setenv("ELENCHUS_ENCRYPTION_KEY", Fernet.generate_key().decode())

    client = TestClient(app)
    response = client.post(
        "/api/models",
        json={
            "name": "test-provider",
            "provider_type": "openai",
            "api_key": "sk-test",
            "api_base_url": "https://example.com/v1",
            "models": ["gpt-4o"],
            "is_default": False,
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "test-provider"
    assert data["provider_type"] == "openai"


def test_list_model_configs_without_trailing_slash(
    db_session,
    monkeypatch,
):
    monkeypatch.setenv("ELENCHUS_ENCRYPTION_KEY", Fernet.generate_key().decode())

    client = TestClient(app)
    create_response = client.post(
        "/api/models",
        json={
            "name": "list-provider",
            "provider_type": "openai",
            "api_key": "sk-test",
            "api_base_url": "https://example.com/v1",
            "models": ["gpt-4o"],
            "is_default": False,
        },
    )
    assert create_response.status_code == 200

    list_response = client.get("/api/models")

    assert list_response.status_code == 200
    providers = list_response.json()
    assert len(providers) == 1
    assert providers[0]["name"] == "list-provider"
