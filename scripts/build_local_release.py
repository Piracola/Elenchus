#!/usr/bin/env python3
"""
Run the full local lightweight release build pipeline.

This is the maintainer-friendly one-command entrypoint for:
- installing frontend dependencies
- building the frontend bundle
- installing backend runtime dependencies
- smoke-testing backend startup
- packaging one or more release archives
"""

from __future__ import annotations

import argparse
import shlex
import shutil
import subprocess
import sys
from pathlib import Path

from package_lightweight_release import OUTPUT_DIR, detect_default_version

ROOT = Path(__file__).resolve().parent.parent


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build local lightweight release packages in one command.",
    )
    parser.add_argument(
        "--version",
        default=detect_default_version(),
        help="Version label embedded in archive names.",
    )
    parser.add_argument(
        "--platform",
        dest="platforms",
        action="append",
        choices=("windows", "unix"),
        help="Target platform to package. Repeat to build multiple platforms. Defaults to both.",
    )
    parser.add_argument(
        "--output-dir",
        default=str(OUTPUT_DIR),
        help="Directory where release archives will be written.",
    )
    parser.add_argument(
        "--skip-frontend-install",
        action="store_true",
        help="Skip `npm ci --prefix frontend`.",
    )
    parser.add_argument(
        "--skip-frontend-build",
        action="store_true",
        help="Skip `npm --prefix frontend run build`.",
    )
    parser.add_argument(
        "--skip-backend-install",
        action="store_true",
        help="Skip `python -m pip install -r backend/requirements.txt`.",
    )
    parser.add_argument(
        "--skip-smoke-test",
        action="store_true",
        help="Skip backend startup smoke test.",
    )
    return parser.parse_args()


def normalize_platforms(platforms: list[str] | None) -> list[str]:
    return platforms or ["windows", "unix"]


def format_command(command: list[str]) -> str:
    return shlex.join(str(part) for part in command)


def resolve_npm_command() -> str:
    if sys.platform.startswith("win"):
        resolved = shutil.which("npm.cmd")
        if resolved:
            return resolved

    resolved = shutil.which("npm")
    if resolved:
        return resolved

    raise FileNotFoundError("npm was not found in PATH. Install Node.js and npm first.")


def build_npm_command(*args: str) -> list[str]:
    npm_command = resolve_npm_command()
    if sys.platform.startswith("win"):
        return ["cmd.exe", "/d", "/c", npm_command, *args]
    return [npm_command, *args]


def run_step(title: str, command: list[str]) -> None:
    print("")
    print(f"==> {title}")
    print(f"$ {format_command(command)}")
    subprocess.run(command, cwd=ROOT, check=True)


def main() -> int:
    args = parse_args()
    output_dir = Path(args.output_dir).resolve()
    platforms = normalize_platforms(args.platforms)

    if not args.skip_frontend_install:
        run_step(
            "Install frontend dependencies",
            build_npm_command("ci", "--prefix", "frontend"),
        )

    if not args.skip_frontend_build:
        run_step(
            "Build frontend bundle",
            build_npm_command("--prefix", "frontend", "run", "build"),
        )

    if not args.skip_backend_install:
        run_step(
            "Install backend runtime dependencies",
            [sys.executable, "-m", "pip", "install", "-r", "backend/requirements.txt"],
        )

    if not args.skip_smoke_test:
        run_step(
            "Smoke test backend startup",
            [sys.executable, "scripts/smoke_test_release_backend.py"],
        )

    for platform in platforms:
        run_step(
            f"Package {platform} lightweight release",
            [
                sys.executable,
                "scripts/package_lightweight_release.py",
                "--platform",
                platform,
                "--version",
                args.version,
                "--output-dir",
                str(output_dir),
            ],
        )

    print("")
    print("Created release artifacts:")
    for platform in platforms:
        archive_name = f"elenchus-lightweight-{args.version}-{platform}.zip"
        archive_path = output_dir / archive_name
        checksum_path = Path(f"{archive_path}.sha256")
        print(f"- {archive_path}")
        print(f"- {checksum_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
