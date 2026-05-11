#!/usr/bin/env python3
"""
Smoke-test the release backend startup lifecycle.

This validates either:
- source-tree backend startup dependencies, or
- a packaged portable release archive by launching the built executable.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT / "backend"
FRONTEND_DIST_DIR = ROOT / "frontend" / "dist"
SMOKE_DIR = ROOT / "dist" / "release-smoke"
_DEFAULT_TIMEOUT_SECONDS = 60.0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Smoke-test an Elenchus release backend.")
    parser.add_argument(
        "--release-archive",
        help="Path to a built portable release zip archive to validate.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=_DEFAULT_TIMEOUT_SECONDS,
        help="Maximum time in seconds to wait for the backend health endpoint.",
    )
    return parser.parse_args()


def configure_runtime_environment() -> None:
    SMOKE_DIR.mkdir(parents=True, exist_ok=True)
    runtime_root = (SMOKE_DIR / "runtime").resolve()

    # Avoid mutating real runtime data during CI or local smoke runs.
    os.environ.setdefault("ELENCHUS_RUNTIME_DIR", str(runtime_root))


async def run_source_tree_smoke_test() -> None:
    configure_runtime_environment()
    sys.path.insert(0, str(BACKEND_DIR))

    from app.main import app

    async with app.router.lifespan_context(app):
        pass


def reserve_local_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def write_packaged_runtime_config(runtime_root: Path, port: int) -> None:
    runtime_root.mkdir(parents=True, exist_ok=True)
    config_path = runtime_root / "config.json"
    payload = {
        "schema_version": 1,
        "server": {
            "host": "127.0.0.1",
            "port": port,
            "debug": False,
            "cors_origins": [
                "http://127.0.0.1:5173",
                "http://localhost:5173",
            ],
        },
        "auth": {
            "enabled": False,
            "jwt_secret_key": "change-me-in-production",
            "jwt_expire_minutes": 10080,
        },
        "providers": [],
        "search": {
            "provider": "duckduckgo",
            "max_results_per_query": 5,
            "searxng": {"base_url": "http://localhost:8080", "api_key": ""},
            "tavily": {"api_url": "https://api.tavily.com/search", "api_key": ""},
        },
        "logging": {
            "level": "INFO",
            "log_dir": "logs",
            "backup_count": 3,
        },
        "demo": {
            "enabled": False,
            "admin_username": "admin",
            "admin_password_hash": "",
            "allowed_models": ["gpt-4o-mini"],
        },
    }
    config_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def read_log_excerpt(log_path: Path, *, max_lines: int = 80) -> str:
    if not log_path.exists():
        return "(no log output captured)"
    lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
    excerpt = lines[-max_lines:]
    return "\n".join(excerpt) if excerpt else "(no log output captured)"


def extract_release_archive(archive_path: Path, destination_dir: Path) -> Path:
    destination_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive_path) as archive:
        archive.extractall(destination_dir)

    extracted_dirs = [path for path in destination_dir.iterdir() if path.is_dir()]
    if len(extracted_dirs) != 1:
        formatted = ", ".join(path.name for path in extracted_dirs) or "(none)"
        raise RuntimeError(
            "Expected the release archive to unpack into exactly one top-level "
            f"directory, found: {formatted}"
        )
    return extracted_dirs[0]


def wait_for_health_endpoint(
    process: subprocess.Popen[object],
    *,
    url: str,
    log_path: Path,
    timeout_seconds: float,
) -> None:
    deadline = time.monotonic() + timeout_seconds
    last_error: Exception | None = None

    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(
                "Packaged release executable exited before reporting healthy status.\n"
                f"Log output:\n{read_log_excerpt(log_path)}"
            )

        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status != 200:
                    raise RuntimeError(
                        f"Unexpected HTTP status from packaged release health check: {response.status}"
                    )
                payload = json.loads(response.read().decode("utf-8"))
                if payload.get("status") != "ok":
                    raise RuntimeError(
                        f"Unexpected health payload from packaged release: {payload}"
                    )
                return
        except (
            OSError,
            urllib.error.URLError,
            TimeoutError,
            ValueError,
            RuntimeError,
        ) as exc:
            last_error = exc
            time.sleep(1)

    raise RuntimeError(
        "Timed out waiting for the packaged release health endpoint.\n"
        f"Last error: {last_error}\n"
        f"Log output:\n{read_log_excerpt(log_path)}"
    )


def terminate_process(process: subprocess.Popen[object] | None) -> None:
    if process is None or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=10)


def run_packaged_release_smoke_test(
    release_archive: Path,
    *,
    timeout_seconds: float,
) -> None:
    if not release_archive.exists():
        raise FileNotFoundError(f"Release archive was not found: {release_archive}")
    if not release_archive.is_file():
        raise FileNotFoundError(f"Release archive path is not a file: {release_archive}")

    extracted_root = extract_release_archive(release_archive, SMOKE_DIR / "extracted")
    executable_path = extracted_root / "elenchus.exe"
    if not executable_path.exists():
        raise FileNotFoundError(
            "Packaged release archive is missing the expected executable: "
            f"{executable_path}"
        )

    runtime_root = SMOKE_DIR / "runtime"
    port = reserve_local_port()
    write_packaged_runtime_config(runtime_root, port)

    log_path = SMOKE_DIR / "packaged-backend.log"
    env = os.environ.copy()
    env["ELENCHUS_RUNTIME_DIR"] = str(runtime_root)
    env["ELENCHUS_OPEN_BROWSER"] = "0"

    process: subprocess.Popen[object] | None = None
    try:
        with log_path.open("w", encoding="utf-8") as log_handle:
            process = subprocess.Popen(
                [str(executable_path)],
                cwd=extracted_root,
                env=env,
                stdout=log_handle,
                stderr=subprocess.STDOUT,
            )
            wait_for_health_endpoint(
                process,
                url=f"http://127.0.0.1:{port}/health",
                log_path=log_path,
                timeout_seconds=timeout_seconds,
            )
        print(f"Packaged release smoke test passed: {release_archive}")
    finally:
        terminate_process(process)


def main() -> int:
    args = parse_args()

    if SMOKE_DIR.exists():
        shutil.rmtree(SMOKE_DIR)

    try:
        if args.release_archive:
            run_packaged_release_smoke_test(
                Path(args.release_archive).expanduser().resolve(),
                timeout_seconds=args.timeout,
            )
        else:
            if not FRONTEND_DIST_DIR.joinpath("index.html").exists():
                raise FileNotFoundError(
                    "frontend/dist/index.html is missing. Build the frontend before running this smoke test."
                )
            asyncio.run(run_source_tree_smoke_test())
            print("Release backend smoke test passed.")
        return 0
    finally:
        if SMOKE_DIR.exists():
            shutil.rmtree(SMOKE_DIR, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
