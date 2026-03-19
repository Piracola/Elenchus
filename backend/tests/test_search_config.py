from __future__ import annotations

import shutil
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace

import pytest
import yaml

from app import config as config_module
from app.search import factory as factory_module
from app.search.factory import SearchProviderFactory


@contextmanager
def _workspace_runtime_paths():
    runtime_root = Path("backend/.pytest-local/search-config")
    if runtime_root.exists():
        shutil.rmtree(runtime_root)
    runtime_backend_dir = runtime_root / "backend"
    runtime_backend_dir.mkdir(parents=True, exist_ok=True)
    try:
        yield SimpleNamespace(
            config_file=runtime_backend_dir / "config.yaml",
            env_file=runtime_backend_dir / ".env",
            default_database_file=runtime_root / "elenchus.db",
            runtime_root=runtime_root,
            runtime_backend_dir=runtime_backend_dir,
            backend_bundle_dir=runtime_root / "backend-src",
            prompts_dir=runtime_root / "prompts",
            frontend_dist_dir=runtime_root / "frontend-dist",
        )
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
def _clear_search_settings_cache():
    config_module.get_settings.cache_clear()
    yield
    config_module.get_settings.cache_clear()


def test_persist_search_settings_updates_runtime_files_and_snapshot(monkeypatch):
    with _workspace_runtime_paths() as runtime_paths:
        monkeypatch.setattr(config_module, "_RUNTIME_PATHS", runtime_paths)
        monkeypatch.setitem(config_module.EnvSettings.model_config, "env_file", str(runtime_paths.env_file))
        for key in ("SEARXNG_BASE_URL", "SEARXNG_API_KEY", "TAVILY_API_KEY", "TAVILY_API_URL"):
            monkeypatch.delenv(key, raising=False)

        config_module.persist_search_settings(
            provider="tavily",
            searxng_base_url="http://searx.local:8080",
            searxng_api_key="searx-secret",
            tavily_api_key="tvly-secret",
            tavily_api_url="https://example.com/tavily/search",
        )

        yaml_data = yaml.safe_load(runtime_paths.config_file.read_text(encoding="utf-8"))
        assert yaml_data["search"]["provider"] == "tavily"

        env_text = runtime_paths.env_file.read_text(encoding="utf-8")
        assert "SEARXNG_BASE_URL=http://searx.local:8080" in env_text
        assert "SEARXNG_API_KEY=searx-secret" in env_text
        assert "TAVILY_API_KEY=tvly-secret" in env_text
        assert "TAVILY_API_URL=https://example.com/tavily/search" in env_text

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
        env_text = runtime_paths.env_file.read_text(encoding="utf-8")
        assert "TAVILY_API_KEY" not in env_text
        assert snapshot["tavily"]["api_key_configured"] is False


@pytest.mark.asyncio
async def test_search_factory_reload_rebuilds_provider_instances(monkeypatch):
    with _workspace_runtime_paths() as runtime_paths:
        monkeypatch.setattr(config_module, "_RUNTIME_PATHS", runtime_paths)
        monkeypatch.setitem(config_module.EnvSettings.model_config, "env_file", str(runtime_paths.env_file))
        for key in ("SEARXNG_BASE_URL", "SEARXNG_API_KEY", "TAVILY_API_KEY", "TAVILY_API_URL"):
            monkeypatch.delenv(key, raising=False)

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
