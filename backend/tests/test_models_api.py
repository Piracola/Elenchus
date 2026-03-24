from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def test_create_model_config_without_trailing_slash(
    db_session,
):
    client = TestClient(app)
    response = client.post(
        "/api/models",
        json={
            "name": "test-provider",
            "provider_type": "openai",
            "api_key": "sk-test",
            "api_base_url": "https://example.com/v1",
            "custom_parameters": {"reasoning_effort": "medium"},
            "models": ["gpt-4o"],
            "is_default": False,
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "test-provider"
    assert data["provider_type"] == "openai"
    assert data["api_key_configured"] is True
    assert "api_key" not in data
    assert data["custom_parameters"] == {"reasoning_effort": "medium"}


def test_list_model_configs_without_trailing_slash(
    db_session,
):
    client = TestClient(app)
    create_response = client.post(
        "/api/models",
        json={
            "name": "list-provider",
            "provider_type": "openai",
            "api_key": "sk-test",
            "api_base_url": "https://example.com/v1",
            "custom_parameters": {"reasoning_effort": "high"},
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
    assert providers[0]["api_key_configured"] is True
    assert "api_key" not in providers[0]
    assert providers[0]["custom_parameters"] == {"reasoning_effort": "high"}


def test_update_model_config_returns_secret_presence_only(
    db_session,
):
    client = TestClient(app)
    create_response = client.post(
        "/api/models",
        json={
            "name": "update-provider",
            "provider_type": "openai",
            "api_key": "sk-old",
            "api_base_url": "https://example.com/v1",
            "custom_parameters": {},
            "models": ["gpt-4o"],
            "is_default": False,
        },
    )
    assert create_response.status_code == 200
    provider_id = create_response.json()["id"]

    update_response = client.put(
        f"/api/models/{provider_id}",
        json={"api_key": "sk-new-secret"},
    )

    assert update_response.status_code == 200
    data = update_response.json()
    assert data["api_key_configured"] is True
    assert "api_key" not in data


def test_clear_model_config_api_key_returns_unconfigured_state(
    db_session,
):
    client = TestClient(app)
    create_response = client.post(
        "/api/models",
        json={
            "name": "clear-provider",
            "provider_type": "openai",
            "api_key": "sk-old",
            "api_base_url": "https://example.com/v1",
            "custom_parameters": {},
            "models": ["gpt-4o"],
            "is_default": False,
        },
    )
    assert create_response.status_code == 200
    provider_id = create_response.json()["id"]

    clear_response = client.put(
        f"/api/models/{provider_id}",
        json={"clear_api_key": True},
    )

    assert clear_response.status_code == 200
    assert clear_response.json()["api_key_configured"] is False
    assert "api_key" not in clear_response.json()

    list_response = client.get("/api/models")
    assert list_response.status_code == 200
    assert list_response.json()[0]["api_key_configured"] is False
    assert "api_key" not in list_response.json()[0]


def test_update_model_config_rejects_duplicate_name(
    db_session,
):
    client = TestClient(app)
    first_response = client.post(
        "/api/models",
        json={
            "name": "provider-a",
            "provider_type": "openai",
            "api_key": "sk-a",
            "api_base_url": "https://example.com/a",
            "custom_parameters": {},
            "models": ["gpt-4o"],
            "is_default": False,
        },
    )
    assert first_response.status_code == 200

    second_response = client.post(
        "/api/models",
        json={
            "name": "provider-b",
            "provider_type": "openai",
            "api_key": "sk-b",
            "api_base_url": "https://example.com/b",
            "custom_parameters": {},
            "models": ["gpt-4o"],
            "is_default": False,
        },
    )
    assert second_response.status_code == 200
    provider_id = second_response.json()["id"]

    update_response = client.put(
        f"/api/models/{provider_id}",
        json={"name": "provider-a"},
    )

    assert update_response.status_code == 400
    assert "already exists" in update_response.json()["detail"]
