"""
Shared utilities for backend manual test scripts.

Provides common setup functions to eliminate boilerplate code duplication
across manual test scripts.

Usage in test scripts:
    from scripts.test_utils import setup_backend_path, run_async

    setup_backend_path()

    async def main():
        # your test code
        pass

    run_async(main)
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Awaitable, Callable


def setup_backend_path() -> None:
    """
    Ensure the backend root is on sys.path.

    This should be called at the start of any manual test script
    that needs to import from the app package.
    """
    backend_root = Path(__file__).resolve().parent.parent
    if str(backend_root) not in sys.path:
        sys.path.insert(0, str(backend_root))


def run_async(main_func: Callable[[], Awaitable[None]]) -> None:
    """
    Run an async main function.

    This is a thin wrapper around asyncio.run() that provides
    a consistent entry point for all manual test scripts.
    """
    asyncio.run(main_func())
