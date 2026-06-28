#!/usr/bin/env python3
"""
Smoke-test a Windows launcher release folder.

The test validates the packaged backend sidecar that the Tauri launcher starts.
It does not click the launcher UI; it verifies the backend layout and lifecycle.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import socket
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SMOKE_DIR = ROOT / "dist" / "launcher-smoke"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Smoke-test a Windows launcher release folder.")
    parser.add_argument("release_dir", help="Path to elenchus-launcher-<version>-windows.")
    parser.add_argument("--timeout", type=float, default=60.0)
    return parser.parse_args()


def reserve_local_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def write_runtime_config(runtime_root: Path, port: int) -> None:
    runtime_root.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema_version": 1,
        "server": {
            "host": "127.0.0.1",
            "port": port,
            "debug": False,
            "cors_origins": [],
        },
        "auth": {
            "enabled": False,
            "jwt_secret_key": "change-me-in-production",
            "jwt_expire_minutes": 10080,
        },
        "providers": [],
        "search": {
            "provider": "ddgs",
            "max_results_per_query": 5,
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
    (runtime_root / "config.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def wait_for_health(process: subprocess.Popen[object], url: str, timeout: float) -> None:
    deadline = time.monotonic() + timeout
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"Backend exited early with code {process.returncode}")
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                payload = json.loads(response.read().decode("utf-8"))
                if response.status == 200 and payload.get("status") == "ok":
                    return
        except (OSError, urllib.error.URLError, TimeoutError, ValueError) as exc:
            last_error = exc
            time.sleep(1)
    raise RuntimeError(f"Timed out waiting for health endpoint. Last error: {last_error}")


def terminate(process: subprocess.Popen[object] | None) -> None:
    if process is None or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=10)


def main() -> int:
    args = parse_args()
    release_dir = Path(args.release_dir).expanduser().resolve()
    launcher_exe = release_dir / "elenchus.exe"
    backend_exe = release_dir / "backend" / "elenchus-backend.exe"

    if not launcher_exe.exists():
        raise FileNotFoundError(f"Missing launcher executable: {launcher_exe}")
    if not backend_exe.exists():
        raise FileNotFoundError(f"Missing backend sidecar executable: {backend_exe}")

    if SMOKE_DIR.exists():
        shutil.rmtree(SMOKE_DIR)
    runtime_root = SMOKE_DIR / "runtime"
    port = reserve_local_port()
    write_runtime_config(runtime_root, port)

    env = os.environ.copy()
    env["ELENCHUS_RUNTIME_DIR"] = str(runtime_root)
    env["ELENCHUS_OPEN_BROWSER"] = "0"

    process: subprocess.Popen[object] | None = None
    try:
        process = subprocess.Popen(
            [str(backend_exe)],
            cwd=backend_exe.parent,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        wait_for_health(process, f"http://127.0.0.1:{port}/health", args.timeout)
        print(f"Windows launcher release smoke test passed: {release_dir}")
        return 0
    finally:
        terminate(process)
        shutil.rmtree(SMOKE_DIR, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
