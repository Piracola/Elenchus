"""
Runtime path helpers for both source-tree and frozen executable modes.
"""

from __future__ import annotations

import logging
import os
import shutil
import sys
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

_RUNTIME_DIR_ENV = "ELENCHUS_RUNTIME_DIR"
logger = logging.getLogger(__name__)


def _is_frozen_runtime() -> bool:
    return bool(getattr(sys, "frozen", False))


def _bundle_root() -> Path:
    if _is_frozen_runtime():
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            return Path(meipass).resolve()
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[2]


def _runtime_root(default_root: Path) -> Path:
    override = os.getenv(_RUNTIME_DIR_ENV, "").strip()
    if override:
        return Path(override).expanduser().resolve()
    return default_root


@dataclass(frozen=True)
class RuntimePaths:
    is_frozen: bool
    bundle_root: Path
    backend_bundle_dir: Path
    frontend_dist_dir: Path
    prompts_dir: Path
    runtime_root: Path
    runtime_data_dir: Path
    runtime_backend_dir: Path
    env_file: Path
    env_example_source: Path
    env_example_runtime_file: Path
    config_file: Path
    config_source: Path
    log_config_file: Path
    log_config_source: Path
    logs_dir: Path
    default_database_file: Path
    legacy_env_file: Path
    legacy_database_file: Path
    legacy_log_config_file: Path
    legacy_logs_dir: Path


@lru_cache()
def get_runtime_paths() -> RuntimePaths:
    bundle_root = _bundle_root()
    is_frozen = _is_frozen_runtime()
    backend_bundle_dir = bundle_root / "backend"
    default_runtime_root = (
        Path(sys.executable).resolve().parent / "runtime"
        if is_frozen
        else bundle_root / "runtime"
    )
    runtime_root = _runtime_root(default_runtime_root)
    runtime_data_dir = runtime_root / "data"
    runtime_backend_dir = runtime_root / "backend"
    log_config_file = runtime_data_dir / "log_config.json"

    return RuntimePaths(
        is_frozen=is_frozen,
        bundle_root=bundle_root,
        backend_bundle_dir=backend_bundle_dir,
        frontend_dist_dir=bundle_root / "frontend" / "dist",
        prompts_dir=backend_bundle_dir / "prompts",
        runtime_root=runtime_root,
        runtime_data_dir=runtime_data_dir,
        runtime_backend_dir=runtime_backend_dir,
        env_file=runtime_backend_dir / ".env",
        env_example_source=backend_bundle_dir / ".env.example",
        env_example_runtime_file=runtime_backend_dir / ".env.example",
        config_file=runtime_backend_dir / "config.yaml",
        config_source=backend_bundle_dir / "config.yaml",
        log_config_file=log_config_file,
        log_config_source=bundle_root / "data" / "log_config.json",
        logs_dir=runtime_root / "logs",
        default_database_file=runtime_root / "elenchus.db",
        legacy_env_file=backend_bundle_dir / ".env",
        legacy_database_file=backend_bundle_dir / "elenchus.db",
        legacy_log_config_file=bundle_root / "data" / "log_config.json",
        legacy_logs_dir=bundle_root / "logs",
    )


def _copy_if_missing(source: Path, target: Path) -> None:
    if not source.exists() or target.exists():
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)


def _migrate_legacy_file(source: Path, target: Path, remove_source: bool = False) -> None:
    if not source.exists() or target.exists():
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
    if remove_source:
        try:
            source.unlink()
        except OSError:
            logger.warning("Could not remove legacy runtime file: %s", source)


def _migrate_legacy_logs(source: Path, target: Path) -> None:
    if not source.exists() or not source.is_dir() or target.exists():
        return
    shutil.copytree(source, target)


def prepare_runtime_environment() -> RuntimePaths:
    paths = get_runtime_paths()

    paths.runtime_root.mkdir(parents=True, exist_ok=True)
    paths.runtime_data_dir.mkdir(parents=True, exist_ok=True)
    paths.runtime_backend_dir.mkdir(parents=True, exist_ok=True)
    paths.logs_dir.mkdir(parents=True, exist_ok=True)

    _copy_if_missing(paths.env_example_source, paths.env_example_runtime_file)
    _migrate_legacy_file(paths.legacy_env_file, paths.env_file)
    if not paths.env_file.exists() and paths.env_example_source.exists():
        _copy_if_missing(paths.env_example_source, paths.env_file)

    _copy_if_missing(paths.config_source, paths.config_file)
    _migrate_legacy_file(paths.legacy_database_file, paths.default_database_file)
    _migrate_legacy_file(paths.legacy_log_config_file, paths.log_config_file)
    _copy_if_missing(paths.log_config_source, paths.log_config_file)
    _migrate_legacy_logs(paths.legacy_logs_dir, paths.logs_dir)

    return paths
