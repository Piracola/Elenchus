#!/usr/bin/env python3
"""
Build a lightweight Elenchus release archive.

The lightweight package is intended for end users who have Python installed but
should not need the full source tree, Node.js, or npm at runtime.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "dist" / "releases"
STAGING_DIR = ROOT / "dist" / "staging"
LAUNCHER_SOURCE_DIR = Path("release/launchers")
LAUNCHER_DEST_DIR = Path("launchers")

COMMON_DIRECTORIES = [
    Path("backend/app"),
    Path("backend/prompts"),
    Path("frontend/dist"),
]

COMMON_FILES = [
    Path("backend/.env.example"),
    Path("backend/config.yaml"),
    Path("backend/requirements.txt"),
    Path("README.md"),
    Path("data/log_config.json"),
]

PLATFORM_LAUNCHERS = {
    "windows": [
        "start-release.bat",
        "start-release.ps1",
    ],
    "unix": [
        "start-release.sh",
    ],
}

IGNORE_PATTERNS = shutil.ignore_patterns(
    "__pycache__",
    "*.pyc",
    "*.pyo",
    ".pytest_cache",
    ".DS_Store",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Package a lightweight Elenchus release.")
    parser.add_argument(
        "--platform",
        choices=("windows", "unix"),
        required=True,
        help="Target platform for the archive.",
    )
    parser.add_argument(
        "--version",
        default=detect_default_version(),
        help="Version label embedded in the archive name.",
    )
    parser.add_argument(
        "--output-dir",
        default=str(OUTPUT_DIR),
        help="Directory where the archive will be written.",
    )
    return parser.parse_args()


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


def ensure_required_files(platform: str) -> None:
    required_paths = [ROOT / "frontend" / "dist" / "index.html"]
    required_paths.extend(ROOT / rel_path for rel_path in COMMON_DIRECTORIES)
    required_paths.extend(ROOT / rel_path for rel_path in COMMON_FILES)
    required_paths.extend(
        ROOT / LAUNCHER_SOURCE_DIR / launcher_name
        for launcher_name in PLATFORM_LAUNCHERS[platform]
    )

    missing = [path for path in required_paths if not path.exists()]
    if missing:
        formatted = "\n".join(f"- {path}" for path in missing)
        raise FileNotFoundError(
            "Missing required runtime files for lightweight release:\n"
            f"{formatted}\n"
            "Build the frontend first with `npm --prefix frontend run build`."
        )


def package_name(platform: str, version: str) -> str:
    return f"elenchus-lightweight-{version}-{platform}"


def copy_tree(src: Path, dst: Path) -> None:
    shutil.copytree(src, dst, ignore=IGNORE_PATTERNS)


def copy_file(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def copy_platform_launchers(platform: str, release_root: Path) -> None:
    for launcher_name in PLATFORM_LAUNCHERS[platform]:
        copy_file(
            ROOT / LAUNCHER_SOURCE_DIR / launcher_name,
            release_root / LAUNCHER_DEST_DIR / launcher_name,
        )


def write_quickstart(target_dir: Path, platform: str, version: str) -> None:
    if platform == "windows":
        start_command = r"Double-click launchers\start-release.bat"
    else:
        start_command = "Run `chmod +x ./launchers/start-release.sh && ./launchers/start-release.sh`"

    content = "\n".join(
        [
            f"Elenchus Lightweight Release {version}",
            "",
            "This package includes:",
            "- Prebuilt frontend static files",
            "- Python backend source and runtime config",
            "- A launchers/ folder for end-user startup scripts",
            "",
            "Before first run:",
            "- Install Python 3.10 or newer",
            "- Extract this archive to a normal writable folder",
            "",
            "Start the app:",
            f"- {start_command}",
            "",
            "What happens on first launch:",
            "- A Python virtual environment is created under backend/venv",
            "- Backend dependencies are installed automatically",
            "- backend/.env is created from backend/.env.example if needed",
            "- A local encryption key is generated automatically",
            "",
            "After launch:",
            "- Open http://localhost:8001",
            "- Add your model provider API key in Settings",
        ]
    )
    (target_dir / "QUICKSTART.txt").write_text(content + "\n", encoding="utf-8")


def build_staging_tree(platform: str, version: str) -> tuple[Path, Path]:
    STAGING_DIR.mkdir(parents=True, exist_ok=True)
    temp_root = STAGING_DIR / package_name(platform, version)
    if temp_root.exists():
        shutil.rmtree(temp_root)
    release_root = temp_root / package_name(platform, version)
    release_root.mkdir(parents=True)

    for rel_path in COMMON_DIRECTORIES:
        copy_tree(ROOT / rel_path, release_root / rel_path)

    for rel_path in COMMON_FILES:
        copy_file(ROOT / rel_path, release_root / rel_path)

    copy_platform_launchers(platform, release_root)

    (release_root / "logs").mkdir(exist_ok=True)
    write_quickstart(release_root, platform, version)

    if platform == "unix":
        launcher = release_root / LAUNCHER_DEST_DIR / "start-release.sh"
        launcher.chmod(0o755)

    return temp_root, release_root


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


def build_archive(platform: str, version: str, output_dir: Path) -> tuple[Path, Path]:
    ensure_required_files(platform)
    temp_root, release_root = build_staging_tree(platform, version)

    output_dir.mkdir(parents=True, exist_ok=True)
    stem = package_name(platform, version)
    archive_path = output_dir / f"{stem}.zip"

    if archive_path.exists():
        archive_path.unlink()

    try:
        create_zip_archive(release_root, archive_path)
    finally:
        if temp_root.exists():
            shutil.rmtree(temp_root)

    checksum_path = write_checksum_file(archive_path)
    return archive_path, checksum_path


def main() -> int:
    args = parse_args()
    output_dir = Path(args.output_dir).resolve()

    archive_path, checksum_path = build_archive(args.platform, args.version, output_dir)
    print(f"Created archive: {archive_path}")
    print(f"Created checksum: {checksum_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
