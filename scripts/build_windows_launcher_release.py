#!/usr/bin/env python3
"""
Assemble a Windows release with the Tauri launcher and packaged backend.

This script expects:
- the Tauri launcher was built with `npm run launcher:build -- --no-bundle`
- the PyInstaller backend was built by `scripts/build_pyinstaller_release.py`

It creates a launcher-first folder:

    elenchus-launcher-<version>-windows/
    ├─ elenchus.exe
    └─ backend/
       ├─ elenchus-backend.exe
       └─ _internal/
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TAURI_EXE = ROOT / "src-tauri" / "target" / "release" / "elenchus-launcher.exe"
PYINSTALLER_BACKEND_DIR = ROOT / "dist" / "pyinstaller" / "raw-dist" / "elenchus"
DEFAULT_OUTPUT_DIR = ROOT / "dist" / "releases"


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


def release_name(version: str) -> str:
    return f"elenchus-launcher-{version}-windows"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the Windows launcher release folder.")
    parser.add_argument("--version", default=detect_default_version())
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument(
        "--include-runtime-config",
        action="store_true",
        help="Bundle a runtime/config.json file into the backend sidecar runtime directory.",
    )
    parser.add_argument(
        "--runtime-config-path",
        help="Repository-relative or absolute path to the runtime config file to bundle.",
    )
    parser.add_argument(
        "--skip-archive",
        action="store_true",
        help="Only create the release folder, not the zip/checksum files.",
    )
    return parser.parse_args()


def ensure_required_artifacts() -> None:
    missing = []
    if not TAURI_EXE.exists():
        missing.append(
            f"{TAURI_EXE} (run `npm run launcher:build -- --no-bundle` first)"
        )
    backend_exe = PYINSTALLER_BACKEND_DIR / "elenchus.exe"
    if not backend_exe.exists():
        missing.append(
            f"{backend_exe} (run `python scripts/build_pyinstaller_release.py` first)"
        )
    if missing:
        raise FileNotFoundError("Missing release artifacts:\n" + "\n".join(f"- {m}" for m in missing))


def copy_backend_sidecar(target_backend_dir: Path) -> None:
    shutil.copytree(PYINSTALLER_BACKEND_DIR, target_backend_dir)
    backend_exe = target_backend_dir / "elenchus.exe"
    backend_sidecar = target_backend_dir / "elenchus-backend.exe"
    if backend_sidecar.exists():
        backend_sidecar.unlink()
    backend_exe.rename(backend_sidecar)


def resolve_runtime_config_path(path_value: str) -> Path:
    candidate = Path(path_value).expanduser()
    if not candidate.is_absolute():
        candidate = ROOT / candidate
    candidate = candidate.resolve()
    if not candidate.exists() or not candidate.is_file():
        raise FileNotFoundError(f"Runtime config file was not found: {candidate}")
    return candidate


def bundle_runtime_config(target_backend_dir: Path, runtime_config_path: Path) -> None:
    target_runtime_dir = target_backend_dir / "runtime"
    target_runtime_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(runtime_config_path, target_runtime_dir / "config.json")


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
    checksum_path.write_text(
        f"{sha256_file(archive_path)}  {archive_path.name}\n",
        encoding="utf-8",
    )
    return checksum_path


def build_release(
    version: str,
    output_dir: Path,
    *,
    skip_archive: bool,
    runtime_config_path: Path | None = None,
) -> tuple[Path, Path | None, Path | None]:
    ensure_required_artifacts()
    output_dir.mkdir(parents=True, exist_ok=True)

    release_root = output_dir / release_name(version)
    if release_root.exists():
        shutil.rmtree(release_root)
    release_root.mkdir(parents=True)

    shutil.copy2(TAURI_EXE, release_root / "elenchus.exe")
    target_backend_dir = release_root / "backend"
    copy_backend_sidecar(target_backend_dir)
    if runtime_config_path is not None:
        bundle_runtime_config(target_backend_dir, runtime_config_path)

    if skip_archive:
        return release_root, None, None

    archive_path = output_dir / f"{release_name(version)}.zip"
    if archive_path.exists():
        archive_path.unlink()
    create_zip_archive(release_root, archive_path)
    checksum_path = write_checksum_file(archive_path)
    return release_root, archive_path, checksum_path


def main() -> int:
    args = parse_args()
    if args.include_runtime_config and not args.runtime_config_path:
        raise ValueError("--include-runtime-config requires --runtime-config-path")
    if args.runtime_config_path and not args.include_runtime_config:
        raise ValueError("--runtime-config-path requires --include-runtime-config")

    runtime_config_path = (
        resolve_runtime_config_path(args.runtime_config_path)
        if args.include_runtime_config
        else None
    )
    release_root, archive_path, checksum_path = build_release(
        args.version,
        Path(args.output_dir).resolve(),
        skip_archive=args.skip_archive,
        runtime_config_path=runtime_config_path,
    )
    print(f"Created launcher release folder: {release_root}")
    if archive_path:
        print(f"Created launcher release zip: {archive_path}")
    if checksum_path:
        print(f"Created checksum: {checksum_path}")
    if runtime_config_path is not None:
        print(f"Bundled runtime config into backend sidecar: {runtime_config_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
