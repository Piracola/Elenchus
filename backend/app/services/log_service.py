"""
Centralized logging configuration for Elenchus.
Supports dynamic log level adjustment and file-based logging.
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime
from enum import IntEnum
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path
from typing import Optional

from pydantic import BaseModel

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


class LogConfig(BaseModel):
    level: str = "INFO"
    log_dir: str = "logs"
    max_bytes: int = 10 * 1024 * 1024
    backup_count: int = 5


LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)-20s | %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


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
        log_config_file = get_runtime_paths().log_config_file
        try:
            if log_config_file.exists():
                with open(log_config_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    level_str = data.get("level", "INFO")
                    return LogLevel.from_string(level_str)
        except (json.JSONDecodeError, KeyError, OSError):
            pass
        return LogLevel.INFO

    def _persist_level(self, level: LogLevel) -> None:
        log_config_file = get_runtime_paths().log_config_file
        try:
            log_config_file.parent.mkdir(parents=True, exist_ok=True)
            with open(log_config_file, "w", encoding="utf-8") as f:
                json.dump({"level": level.to_string()}, f)
        except OSError:
            pass

    def setup(
        self,
        level: LogLevel = LogLevel.INFO,
        log_dir: str = "logs",
        enable_file_logging: bool = True,
    ) -> None:
        persisted_level = self._load_persisted_level()
        self._current_level = persisted_level
        runtime_paths = get_runtime_paths()
        self._log_dir = (
            runtime_paths.logs_dir
            if log_dir == "logs"
            else runtime_paths.runtime_root / log_dir
        )

        root_logger = logging.getLogger()
        root_logger.setLevel(self._current_level.value)

        for handler in root_logger.handlers[:]:
            root_logger.removeHandler(handler)

        self._console_handler = logging.StreamHandler(sys.stdout)
        self._console_handler.setLevel(self._current_level.value)
        self._console_handler.setFormatter(
            logging.Formatter(LOG_FORMAT, datefmt=DATE_FORMAT)
        )
        root_logger.addHandler(self._console_handler)

        if enable_file_logging:
            self._setup_file_handler()

    def _setup_file_handler(self) -> None:
        self._log_dir.mkdir(parents=True, exist_ok=True)

        log_file = self._log_dir / f"elenchus_{datetime.now().strftime('%Y-%m-%d')}.log"

        self._file_handler = TimedRotatingFileHandler(
            filename=str(log_file),
            when="midnight",
            interval=1,
            backupCount=7,
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
