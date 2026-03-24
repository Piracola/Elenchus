"""
Runtime path helpers for both source-tree and frozen executable modes.
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

_RUNTIME_DIR_ENV = "ELENCHUS_RUNTIME_DIR"


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
    sessions_dir: Path
    config_json_file: Path
    logs_dir: Path
    default_database_file: Path


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
    sessions_dir = runtime_root / "sessions"

    return RuntimePaths(
        is_frozen=is_frozen,
        bundle_root=bundle_root,
        backend_bundle_dir=backend_bundle_dir,
        frontend_dist_dir=bundle_root / "frontend" / "dist",
        prompts_dir=backend_bundle_dir / "prompts",
        runtime_root=runtime_root,
        sessions_dir=sessions_dir,
        config_json_file=runtime_root / "config.json",
        logs_dir=runtime_root / "logs",
        default_database_file=runtime_root / "elenchus.db",
    )


def prepare_runtime_environment() -> RuntimePaths:
    paths = get_runtime_paths()
    paths.runtime_root.mkdir(parents=True, exist_ok=True)
    paths.sessions_dir.mkdir(parents=True, exist_ok=True)
    paths.logs_dir.mkdir(parents=True, exist_ok=True)
    return paths
