from __future__ import annotations

import logging

from app import config as config_module
from app.runtime_config_store import load_runtime_config
from app.services.log_service import LogLevel, LogManager
from app.runtime_paths import get_runtime_paths


def test_set_level_persists_to_runtime_config(runtime_dir):
    config_module.get_settings.cache_clear()
    get_runtime_paths.cache_clear()

    manager = LogManager()
    manager.setup(level=LogLevel.INFO, enable_file_logging=False)

    manager.set_level(LogLevel.ERROR)

    runtime_config = load_runtime_config()
    assert runtime_config["logging"]["level"] == "ERROR"
    assert manager.get_level() == LogLevel.ERROR
    assert logging.getLogger().level == logging.ERROR


def test_setup_reads_persisted_level_on_next_start(runtime_dir):
    config_module.get_settings.cache_clear()
    get_runtime_paths.cache_clear()

    manager = LogManager()
    manager.setup(level=LogLevel.INFO, enable_file_logging=False)
    manager.set_level(LogLevel.DEBUG)

    config_module.get_settings.cache_clear()

    restarted_manager = LogManager()
    restarted_manager.setup(level=LogLevel.INFO, enable_file_logging=False)

    assert restarted_manager.get_level() == LogLevel.DEBUG
