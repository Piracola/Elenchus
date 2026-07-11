"""
Centralized logging configuration for Elenchus.
Supports dynamic log level adjustment and file-based logging.
"""

from __future__ import annotations

import logging
import sys
from datetime import datetime
from enum import IntEnum
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path
from typing import Optional

from app.config import _clear_settings_cache, get_settings
from app.runtime_config_store import update_runtime_config
from app.runtime_paths import get_runtime_paths


class LogLevel(IntEnum):
    DEBUG = logging.DEBUG
    INFO = logging.INFO
    WARNING = logging.WARNING
    ERROR = logging.ERROR
    CRITICAL = logging.CRITICAL

    @classmethod
    def from_string(cls, level: str) -> "LogLevel":
        mapping = {
            "DEBUG": cls.DEBUG,
            "INFO": cls.INFO,
            "WARNING": cls.WARNING,
            "ERROR": cls.ERROR,
            "CRITICAL": cls.CRITICAL,
        }
        return mapping.get(level.upper(), cls.INFO)

    def to_string(self) -> str:
        return self.name


LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)-20s | %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"
CONSOLE_LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(message)s"
_CONSOLE_INFO_ALLOWLIST = (
    "app.main",
    "app.runtime.service",
)
_NOISY_LIBRARY_LOGGERS = (
    "aiosqlite",
    "httpcore",
    "httpx",
    "openai",
    "sqlalchemy",
    "sqlalchemy.engine",
    "uvicorn.access",
)


class ConsoleNoiseFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:  # noqa: D401
        if record.levelno >= logging.WARNING:
            return True
        if record.levelno <= logging.DEBUG:
            return False
        return any(
            record.name == logger_name or record.name.startswith(f"{logger_name}.")
            for logger_name in _CONSOLE_INFO_ALLOWLIST
        )


def _quiet_noisy_library_loggers() -> None:
    for logger_name in _NOISY_LIBRARY_LOGGERS:
        logging.getLogger(logger_name).setLevel(logging.WARNING)


class LogManager:
    _instance: Optional["LogManager"] = None
    _current_level: LogLevel = LogLevel.INFO
    _file_handler: Optional[logging.Handler] = None
    _console_handler: Optional[logging.Handler] = None
    _log_dir: Path

    def __new__(cls) -> "LogManager":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._log_dir = Path("logs")
        return cls._instance

    @classmethod
    def get_instance(cls) -> "LogManager":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _load_persisted_level(self) -> LogLevel:
        settings = get_settings()
        return LogLevel.from_string(settings.logging.level)

    def _persist_level(self, level: LogLevel) -> None:
        update_runtime_config(
            lambda config: {
                **config,
                "logging": {
                    **dict(config.get("logging") or {}),
                    "level": level.to_string(),
                },
            }
        )
        _clear_settings_cache()

    @staticmethod
    def _resolve_log_dir(log_dir: str) -> Path:
        runtime_paths = get_runtime_paths()
        if log_dir == "logs":
            return runtime_paths.logs_dir
        return runtime_paths.runtime_root / log_dir

    @staticmethod
    def _resolve_backup_count() -> int:
        settings = get_settings()
        return settings.logging.backup_count

    def setup(
        self,
        level: LogLevel = LogLevel.INFO,
        log_dir: str = "logs",
        enable_file_logging: bool = True,
    ) -> None:
        persisted_level = self._load_persisted_level()
        self._current_level = persisted_level or level
        configured_log_dir = get_settings().logging.log_dir or log_dir
        self._log_dir = self._resolve_log_dir(configured_log_dir)

        root_logger = logging.getLogger()
        root_logger.setLevel(self._current_level.value)
        _quiet_noisy_library_loggers()

        for handler in root_logger.handlers[:]:
            root_logger.removeHandler(handler)

        console_stream = sys.stdout or sys.stderr
        if console_stream is not None:
            self._console_handler = logging.StreamHandler(console_stream)
            self._console_handler.setLevel(self._current_level.value)
            self._console_handler.addFilter(ConsoleNoiseFilter())
            self._console_handler.setFormatter(
                logging.Formatter(CONSOLE_LOG_FORMAT, datefmt=DATE_FORMAT)
            )
            root_logger.addHandler(self._console_handler)
        else:
            self._console_handler = None

        if enable_file_logging:
            self._setup_file_handler()

    def _setup_file_handler(self) -> None:
        self._log_dir.mkdir(parents=True, exist_ok=True)

        log_file = self._log_dir / f"elenchus_{datetime.now().strftime('%Y-%m-%d')}.log"

        self._file_handler = TimedRotatingFileHandler(
            filename=str(log_file),
            when="midnight",
            interval=1,
            backupCount=self._resolve_backup_count(),
            encoding="utf-8",
        )
        self._file_handler.setLevel(self._current_level.value)
        self._file_handler.setFormatter(
            logging.Formatter(LOG_FORMAT, datefmt=DATE_FORMAT)
        )

        root_logger = logging.getLogger()
        root_logger.addHandler(self._file_handler)

    def set_level(self, level: LogLevel) -> None:
        self._current_level = level
        self._persist_level(level)

        root_logger = logging.getLogger()
        root_logger.setLevel(level.value)
        _quiet_noisy_library_loggers()

        if self._console_handler:
            self._console_handler.setLevel(level.value)

        if self._file_handler:
            self._file_handler.setLevel(level.value)

    def get_level(self) -> LogLevel:
        return self._current_level

    def get_log_dir(self) -> Path:
        return self._log_dir


def setup_logging(
    level: str = "INFO",
    log_dir: str = "logs",
    enable_file_logging: bool = True,
) -> LogManager:
    manager = LogManager.get_instance()
    log_level = LogLevel.from_string(level)
    manager.setup(level=log_level, log_dir=log_dir, enable_file_logging=enable_file_logging)
    return manager


def get_log_manager() -> LogManager:
    return LogManager.get_instance()


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
