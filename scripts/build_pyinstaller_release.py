#!/usr/bin/env python3
"""
Build a portable Windows release using PyInstaller.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUILD_ROOT = ROOT / "dist" / "pyinstaller"
RAW_DIST_DIR = BUILD_ROOT / "raw-dist"
WORK_DIR = BUILD_ROOT / "work"
DEFAULT_OUTPUT_DIR = ROOT / "dist" / "releases"
SPEC_FILE = ROOT / "packaging" / "elenchus.spec"


def detect_default_version() -> str:
    package_json = ROOT / "package.json"
    if not package_json.exists():
        return "dev"

    try:
        data = json.loads(package_json.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return "dev"

    version = str(data.get("version", "dev")).strip()
    return version or "dev"


def create_zip_archive(source_dir: Path, archive_path: Path) -> None:
    with zipfile.ZipFile(
        archive_path,
        mode="w",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=9,
    ) as archive:
        for path in sorted(source_dir.rglob("*")):
            archive.write(path, arcname=path.relative_to(source_dir.parent))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_checksum_file(archive_path: Path) -> Path:
    checksum_path = Path(f"{archive_path}.sha256")
    checksum = sha256_file(archive_path)
    checksum_path.write_text(f"{checksum}  {archive_path.name}\n", encoding="utf-8")
    return checksum_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a portable PyInstaller release.")
    parser.add_argument(
        "--version",
        default=detect_default_version(),
        help="Version label embedded in the release folder and zip name.",
    )
    parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_OUTPUT_DIR),
        help="Directory where the portable release will be written.",
    )
    return parser.parse_args()


def ensure_required_files() -> None:
    required_paths = [
        ROOT / "backend" / "run_packaged.py",
        ROOT / "backend" / "prompts",
        ROOT / "backend" / "config.yaml",
        ROOT / "backend" / ".env.example",
        ROOT / "frontend" / "dist" / "index.html",
        ROOT / "frontend" / "public" / "brand" / "elenchus.ico",
        ROOT / "data" / "log_config.json",
        SPEC_FILE,
    ]
    missing = [path for path in required_paths if not path.exists()]
    if missing:
        formatted = "\n".join(f"- {path}" for path in missing)
        raise FileNotFoundError(
            "Missing required files for PyInstaller release:\n"
            f"{formatted}\n"
            "Build the frontend first with `npm --prefix frontend run build`."
        )


def load_pyinstaller_runner():
    try:
        from PyInstaller.__main__ import run as pyinstaller_run
    except ImportError as exc:
        raise RuntimeError(
            "PyInstaller is not installed in the current Python environment. "
            "Install it first, for example with `python -m pip install pyinstaller`."
        ) from exc
    return pyinstaller_run


def release_name(version: str) -> str:
    return f"elenchus-portable-{version}-windows"


def write_quickstart(release_root: Path, version: str) -> None:
    content = "\n".join(
        [
            f"Elenchus Portable Release {version}",
            "",
            "1. Extract this folder or zip to a normal writable location.",
            "2. Double-click `elenchus.exe`.",
            "3. Wait a moment for the backend to start; the browser opens automatically.",
            "",
            "First launch will create a `runtime/` folder beside the executable:",
            "- runtime/backend/.env",
            "- runtime/elenchus.db",
            "- runtime/logs/",
            "",
            "If the browser does not open automatically, visit:",
            "- http://127.0.0.1:8001 (or the fallback port shown in console)",
            "",
            "After launch:",
            "- Open Settings in the UI",
            "- Add your model provider API key",
            "- Start a debate session",
        ]
    )
    (release_root / "QUICKSTART.txt").write_text(content + "\n", encoding="utf-8")


def write_runtime_placeholder(release_root: Path) -> None:
    runtime_dir = release_root / "runtime"
    runtime_dir.mkdir(parents=True, exist_ok=True)
    notice = "\n".join(
        [
            "This folder stores writable runtime data for the portable release.",
            "",
            "It will hold:",
            "- runtime/backend/.env",
            "- runtime/elenchus.db",
            "- runtime/logs/",
        ]
    )
    (runtime_dir / "README.txt").write_text(notice + "\n", encoding="utf-8")


def build_release(version: str, output_dir: Path) -> tuple[Path, Path, Path]:
    pyinstaller_run = load_pyinstaller_runner()

    if BUILD_ROOT.exists():
        shutil.rmtree(BUILD_ROOT)
    BUILD_ROOT.mkdir(parents=True, exist_ok=True)

    previous_cwd = Path.cwd()
    os.chdir(ROOT)
    try:
        pyinstaller_run(
            [
                "--noconfirm",
                "--clean",
                f"--distpath={RAW_DIST_DIR}",
                f"--workpath={WORK_DIR}",
                str(SPEC_FILE),
            ]
        )
    finally:
        os.chdir(previous_cwd)

    built_dir = RAW_DIST_DIR / "elenchus"
    if not built_dir.exists():
        raise FileNotFoundError(f"PyInstaller output folder was not created: {built_dir}")

    output_dir.mkdir(parents=True, exist_ok=True)
    release_root = output_dir / release_name(version)
    if release_root.exists():
        shutil.rmtree(release_root)
    shutil.copytree(built_dir, release_root)

    write_quickstart(release_root, version)
    write_runtime_placeholder(release_root)

    archive_path = output_dir / f"{release_name(version)}.zip"
    if archive_path.exists():
        archive_path.unlink()
    create_zip_archive(release_root, archive_path)
    checksum_path = write_checksum_file(archive_path)

    return release_root, archive_path, checksum_path


def main() -> int:
    args = parse_args()
    output_dir = Path(args.output_dir).resolve()

    ensure_required_files()
    release_root, archive_path, checksum_path = build_release(args.version, output_dir)

    print(f"Created portable folder: {release_root}")
    print(f"Created portable zip: {archive_path}")
    print(f"Created checksum: {checksum_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
