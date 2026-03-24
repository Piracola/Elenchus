from __future__ import annotations

import json
import shutil
from contextlib import contextmanager
from pathlib import Path

import pytest

from app import config as config_module
from app.runtime_config_store import load_runtime_config
from app.search import factory as factory_module
from app.search.factory import SearchProviderFactory
from app.runtime_paths import get_runtime_paths


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


class _FakeDuckDuckGoProvider:
    def __init__(self) -> None:
        self.closed = False

    async def is_available(self) -> bool:
        return True

    async def close(self) -> None:
        self.closed = True


class _FakeSearXNGProvider(_FakeDuckDuckGoProvider):
    def __init__(self, base_url: str, api_key: str | None = None) -> None:
        super().__init__()
        self.base_url = base_url
        self.api_key = api_key


class _FakeTavilyProvider(_FakeDuckDuckGoProvider):
    def __init__(self, api_key: str, api_url: str) -> None:
        super().__init__()
        self.api_key = api_key
        self.api_url = api_url


@pytest.fixture(autouse=True)
def _clear_search_settings_cache(monkeypatch):
    config_module.get_settings.cache_clear()
    get_runtime_paths.cache_clear()
    yield
    config_module.get_settings.cache_clear()
    get_runtime_paths.cache_clear()
    monkeypatch.delenv("ELENCHUS_RUNTIME_DIR", raising=False)


def test_persist_search_settings_updates_runtime_config_and_snapshot(monkeypatch):
    with _workspace_runtime_dir() as runtime_root:
        monkeypatch.setenv("ELENCHUS_RUNTIME_DIR", str(runtime_root.resolve()))

        config_module.persist_search_settings(
            provider="tavily",
            searxng_base_url="http://searx.local:8080",
            searxng_api_key="searx-secret",
            tavily_api_key="tvly-secret",
            tavily_api_url="https://example.com/tavily/search",
        )

        runtime_config = load_runtime_config()
        assert runtime_config["search"]["provider"] == "tavily"
        assert runtime_config["search"]["searxng"]["base_url"] == "http://searx.local:8080"
        assert runtime_config["search"]["searxng"]["api_key"] == "searx-secret"
        assert runtime_config["search"]["tavily"]["api_key"] == "tvly-secret"
        assert runtime_config["search"]["tavily"]["api_url"] == "https://example.com/tavily/search"

        snapshot = config_module.get_search_provider_settings_snapshot()
        assert snapshot["searxng"] == {
            "base_url": "http://searx.local:8080",
            "api_key_configured": True,
        }
        assert snapshot["tavily"] == {
            "api_url": "https://example.com/tavily/search",
            "api_key_configured": True,
        }

        config_module.persist_search_settings(clear_tavily_api_key=True)

        snapshot = config_module.get_search_provider_settings_snapshot()
        runtime_config = load_runtime_config()
        assert runtime_config["search"]["tavily"]["api_key"] == ""
        assert snapshot["tavily"]["api_key_configured"] is False


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

        monkeypatch.setattr(factory_module, "DuckDuckGoProvider", _FakeDuckDuckGoProvider)
        monkeypatch.setattr(factory_module, "SearXNGProvider", _FakeSearXNGProvider)
        monkeypatch.setattr(factory_module, "TavilyProvider", _FakeTavilyProvider)

        config_module.persist_search_settings(
            provider="tavily",
            searxng_base_url="http://searx.initial",
            searxng_api_key="initial-searx-key",
            tavily_api_key="initial-tavily-key",
            tavily_api_url="https://initial.example/search",
        )

        factory = SearchProviderFactory()
        assert factory.get_current_provider() == "tavily"
        assert isinstance(factory._providers["duckduckgo"], _FakeDuckDuckGoProvider)
        assert factory._providers["searxng"].base_url == "http://searx.initial"
        assert factory._providers["searxng"].api_key == "initial-searx-key"
        assert factory._providers["tavily"].api_key == "initial-tavily-key"
        assert factory._providers["tavily"].api_url == "https://initial.example/search"

        old_searxng = factory._providers["searxng"]
        old_tavily = factory._providers["tavily"]

        config_module.persist_search_settings(
            provider="searxng",
            searxng_base_url="http://searx.updated",
            searxng_api_key="updated-searx-key",
            clear_tavily_api_key=True,
            tavily_api_url="https://updated.example/search",
        )
        await factory.reload()

        assert old_searxng.closed is True
        assert old_tavily.closed is True
        assert factory.get_current_provider() == "searxng"
        assert factory._providers["searxng"].base_url == "http://searx.updated"
        assert factory._providers["searxng"].api_key == "updated-searx-key"
        assert "tavily" not in factory._providers
