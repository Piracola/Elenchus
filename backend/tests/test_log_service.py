from __future__ import annotations

import logging

from app import config as config_module
from app.runtime_config_store import load_runtime_config
from app.runtime_paths import get_runtime_paths
from app.services.log_service import LogLevel, LogManager


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


def test_console_noise_filter_hides_nonessential_info_logs():
    from app.services.log_service import ConsoleNoiseFilter

    allowed = logging.LogRecord(
        name="app.main",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="allowed",
        args=(),
        exc_info=None,
    )
    noisy = logging.LogRecord(
        name="app.runtime.bus",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="noisy",
        args=(),
        exc_info=None,
    )
    error = logging.LogRecord(
        name="app.runtime.bus",
        level=logging.ERROR,
        pathname=__file__,
        lineno=1,
        msg="error",
        args=(),
        exc_info=None,
    )

    noise_filter = ConsoleNoiseFilter()
    assert noise_filter.filter(allowed) is True
    assert noise_filter.filter(noisy) is False
    assert noise_filter.filter(error) is True


def test_console_noise_filter_hides_sqlalchemy_statement_logs():
    from app.services.log_service import ConsoleNoiseFilter

    statement = logging.LogRecord(
        name="sqlalchemy.engine.Engine",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="SELECT sessions.id FROM sessions",
        args=(),
        exc_info=None,
    )
    rollback = logging.LogRecord(
        name="sqlalchemy.engine.Engine",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="ROLLBACK",
        args=(),
        exc_info=None,
    )

    noise_filter = ConsoleNoiseFilter()
    assert noise_filter.filter(statement) is False
    assert noise_filter.filter(rollback) is False


def test_setup_quiets_noisy_library_loggers(runtime_dir):
    manager = LogManager()
    manager.setup(level=LogLevel.INFO, enable_file_logging=False)

    assert logging.getLogger("sqlalchemy.engine").getEffectiveLevel() == logging.WARNING
    assert logging.getLogger("uvicorn.access").getEffectiveLevel() == logging.WARNING
