# -*- mode: python ; coding: utf-8 -*-

from __future__ import annotations

from pathlib import Path

from PyInstaller.utils.hooks import collect_all

# Build scripts invoke PyInstaller from the repository root, so `cwd` is stable.
ROOT = Path.cwd().resolve()
ICON_FILE = ROOT / "frontend" / "public" / "brand" / "elenchus.ico"

datas = [
    (str(ROOT / "backend" / "prompts"), "backend/prompts"),
    (str(ROOT / "frontend" / "dist"), "frontend/dist"),
    (str(ROOT / "docs" / "sophistry-fallacy-catalog.md"), "docs"),
]
binaries = []
hiddenimports = []

PACKAGE_DATA_EXCLUDES = [
    "**/__pycache__",
    "**/docs",
    "**/docs/**",
    "**/examples",
    "**/examples/**",
    "**/test",
    "**/test/**",
    "**/tests",
    "**/tests/**",
    "**/testing",
    "**/testing/**",
    "**/*.asm",
    "**/*.c",
    "**/*.cpp",
    "**/*.h",
    "**/*.hpp",
    "**/*.md",
    "**/*.obj",
    "**/*.pxd",
    "**/*.pyi",
    "**/*.pyx",
    "**/*.rst",
    "**/*.typed",
]


def include_runtime_submodule(name: str) -> bool:
    lowered = name.lower()
    return all(
        part not in lowered
        for part in (
            ".test",
            ".tests",
            ".testing",
            ".example",
            ".examples",
            ".pytest",
            ".pytest_plugin",
            ".mypy",
            ".__main__",
            ".cli",
        )
    )

for package_name in (
    "uvicorn",
    "websockets",
    "anyio",
    "langgraph",
    "langchain_core",
    "langchain_openai",
    "langchain_anthropic",
    "langchain_google_genai",
    "openai",
    "ddgs",
    "httpx",
    "sqlalchemy",
    "aiosqlite",
    "greenlet",
    "cryptography",
):
    package_datas, package_binaries, package_hiddenimports = collect_all(
        package_name,
        include_py_files=False,
        filter_submodules=include_runtime_submodule,
        exclude_datas=PACKAGE_DATA_EXCLUDES,
    )
    datas += package_datas
    binaries += package_binaries
    hiddenimports += package_hiddenimports

hiddenimports = sorted(set(hiddenimports))

a = Analysis(
    [str(ROOT / "backend" / "run_packaged.py")],
    pathex=[str(ROOT / "backend")],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="elenchus",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    icon=str(ICON_FILE),
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="elenchus",
)
