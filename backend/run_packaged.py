"""
Portable release entry point for a frozen Elenchus build.
"""

from __future__ import annotations

import errno
import os
import socket
import threading
import time
import webbrowser

import uvicorn

from app.config import get_settings
from app.main import app

_DEFAULT_PORT_PROBE_ATTEMPTS = 20


def _should_open_browser() -> bool:
    value = os.getenv("ELENCHUS_OPEN_BROWSER", "1").strip().lower()
    return value not in {"0", "false", "no"}


def _open_browser_later(url: str) -> None:
    def _worker() -> None:
        time.sleep(1.5)
        webbrowser.open(url)

    threading.Thread(target=_worker, daemon=True).start()


def _is_port_available(host: str, port: int) -> bool:
    try:
        addr_info = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror:
        return False

    # If host resolves to multiple addresses (for example localhost), one
    # successful bind is enough for uvicorn to start.
    for family, sock_type, proto, _, sockaddr in addr_info:
        try:
            with socket.socket(family, sock_type, proto) as sock:
                sock.bind(sockaddr)
            return True
        except OSError as exc:
            winerror = getattr(exc, "winerror", None)
            if exc.errno in {errno.EADDRINUSE, errno.EACCES} or winerror in {10013, 10048}:
                continue
            continue
    return False


def _select_port(host: str, preferred_port: int) -> int:
    max_attempts = int(
        os.getenv(
            "ELENCHUS_PORT_PROBE_ATTEMPTS",
            str(_DEFAULT_PORT_PROBE_ATTEMPTS),
        )
    )
    max_attempts = max(max_attempts, 0)

    for offset in range(max_attempts + 1):
        candidate = preferred_port + offset
        if candidate > 65535:
            break
        if _is_port_available(host, candidate):
            return candidate

    raise RuntimeError(
        f"No free port found from {preferred_port} to {preferred_port + max_attempts}."
    )


def main() -> None:
    settings = get_settings()
    host = settings.env.host
    configured_port = settings.env.port
    port = _select_port(host, configured_port)
    if port != configured_port:
        print(
            f"[Elenchus] Port {configured_port} is occupied; switched to port {port}.",
            flush=True,
        )

    browser_host = "127.0.0.1" if host in {"0.0.0.0", "::"} else host
    if _should_open_browser():
        _open_browser_later(f"http://{browser_host}:{port}")

    uvicorn.run(app, host=host, port=port, reload=False)


if __name__ == "__main__":
    main()
