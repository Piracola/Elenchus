from __future__ import annotations

import json
import shutil
from contextlib import contextmanager
from pathlib import Path

import pytest

from app import config as config_module
from app.runtime_config_store import load_runtime_config
from app.runtime_paths import get_runtime_paths
from app.search import factory as factory_module
from app.search.factory import SearchProviderFactory


@contextmanager
def _workspace_runtime_dir():
    runtime_root = Path("backend/.pytest-local/search-config")
    if runtime_root.exists():
        shutil.rmtree(runtime_root)
    runtime_root.mkdir(parents=True, exist_ok=True)
    try:
        yield runtime_root
    finally:
        shutil.rmtree(runtime_root, ignore_errors=True)


class _FakeDDGSProvider:
    def __init__(self) -> None:
        self.closed = False

    async def is_available(self) -> bool:
        return True

    async def close(self) -> None:
        self.closed = True


class _FakeCustomProvider(_FakeDDGSProvider):
    def __init__(self, endpoint: str, api_key: str = "") -> None:
        super().__init__()
        self.endpoint = endpoint
        self.api_key = api_key


@pytest.fixture(autouse=True)
def _clear_search_settings_cache(monkeypatch):
    config_module.get_settings.cache_clear()
    get_runtime_paths.cache_clear()
    yield
    config_module.get_settings.cache_clear()
    get_runtime_paths.cache_clear()
    monkeypatch.delenv("ELENCHUS_RUNTIME_DIR", raising=False)


def test_persist_search_settings_updates_custom_config_and_snapshot(monkeypatch):
    with _workspace_runtime_dir() as runtime_root:
        monkeypatch.setenv("ELENCHUS_RUNTIME_DIR", str(runtime_root.resolve()))

        config_module.persist_search_settings(
            provider="custom",
            custom_endpoint="https://search.example.com/query",
            custom_api_key="custom-secret",
        )

        runtime_config = load_runtime_config()
        assert runtime_config["search"]["provider"] == "custom"
        assert runtime_config["search"]["custom"]["endpoint"] == "https://search.example.com/query"
        assert runtime_config["search"]["custom"]["api_key"] == "custom-secret"

        snapshot = config_module.get_search_provider_settings_snapshot()
        assert snapshot["custom"] == {
            "endpoint": "https://search.example.com/query",
            "api_key_configured": True,
        }

        config_module.persist_search_settings(clear_custom_api_key=True)

        snapshot = config_module.get_search_provider_settings_snapshot()
        runtime_config = load_runtime_config()
        assert runtime_config["search"]["custom"]["api_key"] == ""
        assert snapshot["custom"]["api_key_configured"] is False


def test_load_runtime_config_accepts_utf8_bom(monkeypatch):
    with _workspace_runtime_dir() as runtime_root:
        monkeypatch.setenv("ELENCHUS_RUNTIME_DIR", str(runtime_root.resolve()))

        payload = {
            "schema_version": 1,
            "server": {
                "host": "127.0.0.1",
                "port": 18081,
                "debug": False,
                "cors_origins": ["http://127.0.0.1:5173"],
                "database_url": "sqlite+aiosqlite:///./elenchus.db",
            },
        }
        config_path = runtime_root / "config.json"
        config_path.write_text(json.dumps(payload), encoding="utf-8-sig")

        runtime_config = load_runtime_config()
        assert runtime_config["server"]["host"] == "127.0.0.1"
        assert runtime_config["server"]["port"] == 18081


@pytest.mark.asyncio
async def test_search_factory_reload_rebuilds_provider_instances(monkeypatch):
    with _workspace_runtime_dir() as runtime_root:
        monkeypatch.setenv("ELENCHUS_RUNTIME_DIR", str(runtime_root.resolve()))

        monkeypatch.setattr(factory_module, "DDGSProvider", _FakeDDGSProvider)
        monkeypatch.setattr(factory_module, "CustomSearchProvider", _FakeCustomProvider)

        config_module.persist_search_settings(
            provider="custom",
            custom_endpoint="https://search.example.com/query",
            custom_api_key="initial-key",
        )

        factory = SearchProviderFactory()
        assert factory.get_current_provider() == "custom"
        assert isinstance(factory._providers["ddgs"], _FakeDDGSProvider)
        assert factory._providers["custom"].endpoint == "https://search.example.com/query"
        assert factory._providers["custom"].api_key == "initial-key"

        old_custom = factory._providers["custom"]

        config_module.persist_search_settings(
            provider="ddgs",
            custom_endpoint="https://updated-search.example.com/query",
            clear_custom_api_key=True,
        )
        await factory.reload()

        assert old_custom.closed is True
        assert factory.get_current_provider() == "ddgs"
        assert "custom" in factory._providers
        assert factory._providers["custom"].endpoint == "https://updated-search.example.com/query"
        assert factory._providers["custom"].api_key == ""


def test_legacy_duckduckgo_provider_is_normalized_to_ddgs(monkeypatch):
    with _workspace_runtime_dir() as runtime_root:
        monkeypatch.setenv("ELENCHUS_RUNTIME_DIR", str(runtime_root.resolve()))

        config_module.persist_search_settings(provider="duckduckgo")

        runtime_config = load_runtime_config()
        assert runtime_config["search"]["provider"] == "ddgs"
        assert config_module.get_settings().search.provider == "ddgs"
