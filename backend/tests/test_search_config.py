from __future__ import annotations

import json
import shutil
from contextlib import contextmanager
from pathlib import Path

import pytest

from app import config as config_module
from app.runtime_config_store import load_runtime_config
from app.runtime_paths import get_runtime_paths
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


def test_persist_search_settings_updates_provider_section_and_snapshot(monkeypatch):
    with _workspace_runtime_dir() as runtime_root:
        monkeypatch.setenv("ELENCHUS_RUNTIME_DIR", str(runtime_root.resolve()))

        config_module.persist_search_settings(
            provider="custom",
            provider_settings={
                "custom": {
                    "endpoint": "https://search.example.com/query",
                    "api_key": "custom-secret",
                }
            },
        )

        runtime_config = load_runtime_config()
        sections = runtime_config["search"]["providers"]
        assert runtime_config["search"]["provider"] == "custom"
        assert sections["custom"]["endpoint"] == "https://search.example.com/query"
        # In-memory config is decrypted for use.
        assert sections["custom"]["api_key"] == "custom-secret"

        snapshot = config_module.get_search_provider_settings_snapshot()
        assert snapshot["custom"] == {
            "endpoint": "https://search.example.com/query",
            "api_key_configured": True,
        }

        # An omitted field is left untouched; an empty one clears the secret.
        config_module.persist_search_settings(provider_settings={"custom": {"api_key": ""}})

        snapshot = config_module.get_search_provider_settings_snapshot()
        runtime_config = load_runtime_config()
        assert runtime_config["search"]["providers"]["custom"]["api_key"] == ""
        assert runtime_config["search"]["providers"]["custom"]["endpoint"] == (
            "https://search.example.com/query"
        )
        assert snapshot["custom"]["api_key_configured"] is False


def test_search_provider_secrets_are_encrypted_at_rest(monkeypatch):
    with _workspace_runtime_dir() as runtime_root:
        monkeypatch.setenv("ELENCHUS_RUNTIME_DIR", str(runtime_root.resolve()))
        monkeypatch.delenv("ELENCHUS_ENCRYPTION_KEY", raising=False)
        from app import crypto

        crypto.reset_crypto_cache()

        config_module.persist_search_settings(
            provider_settings={"tavily": {"api_key": "tvly-secret"}}
        )

        on_disk = json.loads((runtime_root / "config.json").read_text(encoding="utf-8"))
        stored = on_disk["search"]["providers"]["tavily"]["api_key"]
        assert stored != "tvly-secret"
        assert stored.startswith("gAAAA")

        # Reading it back must not rewrite plaintext to disk.
        assert load_runtime_config()["search"]["providers"]["tavily"]["api_key"] == "tvly-secret"
        still_sealed = json.loads((runtime_root / "config.json").read_text(encoding="utf-8"))
        assert still_sealed["search"]["providers"]["tavily"]["api_key"] == stored


def test_legacy_custom_section_is_migrated_to_provider_map(monkeypatch):
    with _workspace_runtime_dir() as runtime_root:
        monkeypatch.setenv("ELENCHUS_RUNTIME_DIR", str(runtime_root.resolve()))

        # Pre-registry layout: settings lived under `search.custom`.
        (runtime_root / "config.json").write_text(
            json.dumps(
                {
                    "search": {
                        "provider": "custom",
                        "custom": {
                            "endpoint": "https://legacy.example.com/search",
                            "api_key": "legacy-key",
                        },
                    }
                }
            ),
            encoding="utf-8",
        )

        runtime_config = load_runtime_config()
        migrated = runtime_config["search"]["providers"]["custom"]
        assert migrated["endpoint"] == "https://legacy.example.com/search"
        assert migrated["api_key"] == "legacy-key"
        assert "custom" not in runtime_config["search"]


def test_unknown_provider_falls_back_and_unknown_fields_are_dropped(monkeypatch):
    with _workspace_runtime_dir() as runtime_root:
        monkeypatch.setenv("ELENCHUS_RUNTIME_DIR", str(runtime_root.resolve()))

        (runtime_root / "config.json").write_text(
            json.dumps(
                {
                    "search": {
                        "provider": "does-not-exist",
                        "max_results_per_query": 999,
                        "providers": {
                            "tavily": {"api_key": "k", "bogus_field": "x"},
                            "removed-provider": {"api_key": "y"},
                        },
                    }
                }
            ),
            encoding="utf-8",
        )

        search = load_runtime_config()["search"]
        assert search["provider"] == "ddgs"
        assert search["max_results_per_query"] == 10  # clamped
        assert search["providers"]["tavily"] == {"api_key": "k"}
        assert "removed-provider" not in search["providers"]


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

        config_module.persist_search_settings(
            provider="custom",
            provider_settings={
                "custom": {
                    "endpoint": "https://search.example.com/query",
                    "api_key": "initial-key",
                }
            },
        )

        factory = SearchProviderFactory()
        assert factory.get_current_provider() == "custom"
        assert factory._providers["custom"].endpoint == "https://search.example.com/query"
        assert factory._providers["custom"].api_key == "initial-key"
        # Providers without their required fields are not instantiated at all.
        assert "tavily" not in factory._providers

        old_custom = factory._providers["custom"]

        config_module.persist_search_settings(
            provider="ddgs",
            provider_settings={
                "custom": {
                    "endpoint": "https://updated-search.example.com/query",
                    "api_key": "",
                }
            },
        )
        await factory.reload()

        assert old_custom._client.is_closed is True
        assert factory.get_current_provider() == "ddgs"
        assert factory._providers["custom"].endpoint == "https://updated-search.example.com/query"
        assert factory._providers["custom"].api_key == ""


@pytest.mark.asyncio
async def test_configuring_an_api_provider_makes_it_selectable(monkeypatch):
    with _workspace_runtime_dir() as runtime_root:
        monkeypatch.setenv("ELENCHUS_RUNTIME_DIR", str(runtime_root.resolve()))

        factory = SearchProviderFactory()
        assert factory.set_provider("tavily") is False

        config_module.persist_search_settings(
            provider="tavily",
            provider_settings={"tavily": {"api_key": "tvly-123"}},
        )
        await factory.reload()

        assert factory.get_current_provider() == "tavily"
        assert factory._providers["tavily"].api_key == "tvly-123"
        statuses = {info.name: info for info in await factory.get_available_providers()}
        assert statuses["tavily"].configured is True
        assert statuses["tavily"].available is True
        await factory.close()


def test_legacy_duckduckgo_provider_is_normalized_to_ddgs(monkeypatch):
    with _workspace_runtime_dir() as runtime_root:
        monkeypatch.setenv("ELENCHUS_RUNTIME_DIR", str(runtime_root.resolve()))

        config_module.persist_search_settings(provider="duckduckgo")

        runtime_config = load_runtime_config()
        assert runtime_config["search"]["provider"] == "ddgs"
        assert config_module.get_settings().search.provider == "ddgs"
