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
import stat
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUILD_ROOT = ROOT / "dist" / "pyinstaller"
RAW_DIST_DIR = BUILD_ROOT / "raw-dist"
WORK_DIR = BUILD_ROOT / "work"
DEFAULT_OUTPUT_DIR = ROOT / "dist" / "releases"
SPEC_FILE = ROOT / "packaging" / "elenchus.spec"
LIVE_RUNTIME_CONFIG = ROOT / "runtime" / "config.json"
_REPARSE_POINT_FLAG = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)


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
    parser.add_argument(
        "--include-runtime-config",
        action="store_true",
        help="Bundle a runtime/config.json file into the portable release.",
    )
    parser.add_argument(
        "--runtime-config-path",
        help="Repository-relative or absolute path to the runtime config file to bundle.",
    )
    parser.add_argument(
        "--allow-live-runtime-config",
        action="store_true",
        help="Acknowledge bundling the live runtime/config.json file from the repository.",
    )
    return parser.parse_args()


def ensure_required_files() -> None:
    required_paths = [
        ROOT / "backend" / "run_packaged.py",
        ROOT / "backend" / "prompts",
        ROOT / "frontend" / "dist" / "index.html",
        ROOT / "frontend" / "public" / "brand" / "elenchus.png",
        ROOT / "frontend" / "public" / "brand" / "elenchus.ico",
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
            "Sync the backend build environment first, for example with "
            "`uv sync --project backend --frozen --no-default-groups --group build`."
        ) from exc
    return pyinstaller_run


def release_name(version: str) -> str:
    return f"elenchus-portable-{version}-windows"


def resolve_absolute_path(path_value: str, *, base_path: Path = ROOT) -> Path:
    candidate = Path(path_value).expanduser()
    if not candidate.is_absolute():
        candidate = base_path / candidate
    return Path(os.path.abspath(os.fspath(candidate)))


def ensure_existing_file(path: Path, *, label: str) -> Path:
    if not path.exists():
        raise FileNotFoundError(f"{label} was not found: {path}")
    if not path.is_file():
        raise FileNotFoundError(f"{label} is not a file: {path}")
    return path


def path_is_linked(path: Path) -> bool:
    if path.is_symlink():
        return True
    try:
        file_attributes = getattr(path.lstat(), "st_file_attributes", 0)
    except OSError as exc:
        raise RuntimeError(f"Unable to inspect path metadata: {path}") from exc
    return bool(file_attributes & _REPARSE_POINT_FLAG)


def path_has_linked_ancestor(path: Path) -> bool:
    current = path.parent
    while True:
        if path_is_linked(current):
            return True
        if current.parent == current:
            return False
        current = current.parent


def bundle_runtime_config(release_root: Path, runtime_config_path: Path) -> None:
    target_runtime_dir = release_root / "runtime"
    target_runtime_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(runtime_config_path, target_runtime_dir / "config.json")


def validate_runtime_config_args(
    args: argparse.Namespace,
) -> tuple[Path | None, bool]:
    if not args.include_runtime_config and (
        args.runtime_config_path or args.allow_live_runtime_config
    ):
        raise ValueError("Runtime config bundling options require --include-runtime-config.")

    if not args.include_runtime_config:
        return None, False

    if not args.runtime_config_path:
        raise ValueError(
            "Bundling a runtime config now requires "
            "--runtime-config-path <sanitized-config.json>. "
            "The live runtime/config.json is blocked by default. "
            "To intentionally ship it, add "
            "--runtime-config-path runtime/config.json --allow-live-runtime-config."
        )

    runtime_config_path = ensure_existing_file(
        resolve_absolute_path(args.runtime_config_path),
        label="Specified runtime config file",
    )

    if path_is_linked(runtime_config_path):
        raise ValueError(
            "Runtime config source must be a standalone regular file, "
            f"not a linked alias: {runtime_config_path}"
        )

    if path_has_linked_ancestor(runtime_config_path):
        raise ValueError(
            "Runtime config source must not live under a symbolic link or junction: "
            f"{runtime_config_path}"
        )

    live_runtime_config = ensure_existing_file(
        LIVE_RUNTIME_CONFIG,
        label="Live runtime config file",
    )

    try:
        bundling_live_runtime_config = os.path.samefile(
            runtime_config_path,
            live_runtime_config,
        )
    except OSError as exc:
        raise RuntimeError(
            f"Unable to verify runtime config file identity for: {runtime_config_path}"
        ) from exc

    try:
        hard_link_count = runtime_config_path.stat().st_nlink
    except OSError as exc:
        raise RuntimeError(
            "Unable to verify that the runtime config source is not a hard-linked "
            f"alias: {runtime_config_path}"
        ) from exc

    if hard_link_count > 1:
        raise ValueError(
            "Runtime config source must be a standalone regular file, "
            f"not a hard-linked alias: {runtime_config_path}"
        )

    if bundling_live_runtime_config and not args.allow_live_runtime_config:
        raise ValueError(
            "Refusing to bundle the live runtime/config.json without "
            "--allow-live-runtime-config. Recommended: create a sanitized release "
            "config file and pass it via --runtime-config-path."
        )

    if args.allow_live_runtime_config and not bundling_live_runtime_config:
        print(
            "Warning: --allow-live-runtime-config was provided, but the selected "
            "runtime config is not runtime/config.json."
        )

    return runtime_config_path, bundling_live_runtime_config


def build_release(
    version: str,
    output_dir: Path,
    *,
    runtime_config_path: Path | None = None,
) -> tuple[Path, Path, Path]:
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
    if runtime_config_path is not None:
        bundle_runtime_config(release_root, runtime_config_path)

    archive_path = output_dir / f"{release_name(version)}.zip"
    if archive_path.exists():
        archive_path.unlink()
    create_zip_archive(release_root, archive_path)
    checksum_path = write_checksum_file(archive_path)

    return release_root, archive_path, checksum_path


def main() -> int:
    args = parse_args()
    output_dir = Path(args.output_dir).resolve()
    runtime_config_path, bundling_live_runtime_config = validate_runtime_config_args(args)

    ensure_required_files()
    release_root, archive_path, checksum_path = build_release(
        args.version,
        output_dir,
        runtime_config_path=runtime_config_path,
    )

    print(f"Created portable folder: {release_root}")
    print(f"Created portable zip: {archive_path}")
    print(f"Created checksum: {checksum_path}")
    if runtime_config_path is not None:
        if bundling_live_runtime_config:
            print(
                "Bundled runtime config into release artifacts from the live "
                f"repository file: {runtime_config_path}"
            )
        else:
            print(
                "Bundled runtime config into release artifacts from "
                f"{runtime_config_path}"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
