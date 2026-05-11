"""
Demo mode request guard.

When demo_mode is enabled, blocks all mutation endpoints unless the request
carries a valid admin token. Read-only (GET) endpoints are always allowed.
"""

from __future__ import annotations

import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Final

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import get_settings
from app.middleware.admin_auth import is_valid_admin_token

DEMO_MODE_ADMIN_REQUIRED_MESSAGE: Final[str] = (
    "Demo mode: this operation is not allowed. Log in as admin for full access."
)


@dataclass(frozen=True)
class DemoCapabilityPolicy:
    guest_accessible: bool
    description: str


@dataclass(frozen=True)
class DemoHttpRoutePolicy:
    pattern: re.Pattern[str]
    methods: frozenset[str] | None
    capability: str

    def matches(self, path: str, method: str) -> bool:
        if not self.pattern.match(path):
            return False
        if self.methods is None:
            return True
        return method in self.methods


DEMO_CAPABILITY_POLICY: Final[dict[str, DemoCapabilityPolicy]] = {
    # GET requests remain guest-accessible by default in demo mode.
    # Mutations are admin-only by default unless explicitly marked below.
    "health.read": DemoCapabilityPolicy(True, "Health and diagnostics stay public in demo mode."),
    "mode.read": DemoCapabilityPolicy(True, "The frontend can detect demo mode without admin access."),
    "session.list": DemoCapabilityPolicy(True, "Guests can browse shared demo sessions."),
    "session.create": DemoCapabilityPolicy(True, "Guests can create shared demo sessions."),
    "session.detail": DemoCapabilityPolicy(True, "Guests can inspect shared demo sessions."),
    "session.export": DemoCapabilityPolicy(True, "Guests can export shared demo sessions."),
    "session.documents.manage": DemoCapabilityPolicy(
        True,
        "Guests can upload and manage shared reference documents in demo mode.",
    ),
    "session.runtime.events.read": DemoCapabilityPolicy(
        True,
        "Guests can read runtime event streams in demo mode.",
    ),
    "session.runtime.status": DemoCapabilityPolicy(True, "Guests can poll debate status in demo mode."),
    "session.runtime.live_events": DemoCapabilityPolicy(
        True,
        "Guests can poll live debate events in demo mode.",
    ),
    "session.runtime.start": DemoCapabilityPolicy(True, "Guests can start demo debates."),
    "session.runtime.stop": DemoCapabilityPolicy(True, "Guests can stop demo debates."),
    "session.runtime.intervene": DemoCapabilityPolicy(True, "Guests can intervene in demo debates."),
    "websocket.connect": DemoCapabilityPolicy(True, "Guests can subscribe to demo debate streams."),
    "websocket.action.ping": DemoCapabilityPolicy(True, "Guests can keep demo WebSocket connections alive."),
    "websocket.action.start": DemoCapabilityPolicy(True, "Guests can start demo debates over WebSocket."),
    "websocket.action.stop": DemoCapabilityPolicy(True, "Guests can stop demo debates over WebSocket."),
    "websocket.action.intervene": DemoCapabilityPolicy(
        True,
        "Guests can queue interventions over WebSocket in demo mode.",
    ),
    "admin.auth": DemoCapabilityPolicy(True, "Guests can reach demo admin login/logout/status endpoints."),
    "admin.set_password": DemoCapabilityPolicy(
        False,
        "Changing the demo admin password always requires admin access.",
    ),
}

_DEMO_HTTP_ROUTE_POLICIES: Final[tuple[DemoHttpRoutePolicy, ...]] = (
    DemoHttpRoutePolicy(re.compile(r"^/api/admin/set-password$"), frozenset({"POST"}), "admin.set_password"),
    DemoHttpRoutePolicy(re.compile(r"^/health(?:/.*)?$"), None, "health.read"),
    DemoHttpRoutePolicy(re.compile(r"^/api/health(?:/.*)?$"), None, "health.read"),
    DemoHttpRoutePolicy(re.compile(r"^/api/mode$"), frozenset({"GET"}), "mode.read"),
    DemoHttpRoutePolicy(re.compile(r"^/api/sessions$"), frozenset({"GET"}), "session.list"),
    DemoHttpRoutePolicy(re.compile(r"^/api/sessions$"), frozenset({"POST"}), "session.create"),
    DemoHttpRoutePolicy(re.compile(r"^/api/sessions/[^/]+$"), frozenset({"GET"}), "session.detail"),
    DemoHttpRoutePolicy(re.compile(r"^/api/sessions/[^/]+/export$"), frozenset({"GET"}), "session.export"),
    DemoHttpRoutePolicy(
        re.compile(r"^/api/sessions/[^/]+/documents(?:/[^/]+)?$"),
        None,
        "session.documents.manage",
    ),
    DemoHttpRoutePolicy(
        re.compile(r"^/api/sessions/[^/]+/runtime-events(?:/export)?$"),
        frozenset({"GET"}),
        "session.runtime.events.read",
    ),
    DemoHttpRoutePolicy(
        re.compile(r"^/api/sessions/[^/]+/status$"),
        frozenset({"GET"}),
        "session.runtime.status",
    ),
    DemoHttpRoutePolicy(
        re.compile(r"^/api/sessions/[^/]+/live-events$"),
        frozenset({"GET"}),
        "session.runtime.live_events",
    ),
    DemoHttpRoutePolicy(
        re.compile(r"^/api/sessions/[^/]+/start$"),
        frozenset({"POST"}),
        "session.runtime.start",
    ),
    DemoHttpRoutePolicy(
        re.compile(r"^/api/sessions/[^/]+/stop$"),
        frozenset({"POST"}),
        "session.runtime.stop",
    ),
    DemoHttpRoutePolicy(
        re.compile(r"^/api/sessions/[^/]+/intervene$"),
        frozenset({"POST"}),
        "session.runtime.intervene",
    ),
    DemoHttpRoutePolicy(re.compile(r"^/api/admin/"), None, "admin.auth"),
)

_DEMO_WEBSOCKET_ACTION_CAPABILITIES: Final[dict[str, str]] = {
    "ping": "websocket.action.ping",
    "start": "websocket.action.start",
    "stop": "websocket.action.stop",
    "intervene": "websocket.action.intervene",
}


class DemoGuardMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        settings = get_settings()
        if not settings.demo.enabled:
            return await call_next(request)

        # Admin token bypass
        token = extract_admin_token_from_request(request)
        if token and is_valid_admin_token(token):
            return await call_next(request)

        path = request.url.path
        method = request.method.upper()

        if is_demo_guest_request_allowed(path, method):
            return await call_next(request)

        # Otherwise block
        return JSONResponse(
            status_code=403,
            content={"error": DEMO_MODE_ADMIN_REQUIRED_MESSAGE},
        )


def extract_bearer_token(header: str) -> str | None:
    if header.startswith("Bearer "):
        return header[7:].strip()
    return None


def extract_admin_token_from_request(request: Request) -> str | None:
    """Extract admin token from Authorization header, httpOnly cookie, or query param."""
    auth_header = request.headers.get("authorization", "")
    token = extract_bearer_token(auth_header)
    if not token:
        token = request.cookies.get("elenchus_admin_token")
    if not token:
        token = request.query_params.get("admin_token")
    return token


def get_demo_http_capability(path: str, method: str) -> str | None:
    normalized_method = method.upper()
    for policy in _DEMO_HTTP_ROUTE_POLICIES:
        if policy.matches(path, normalized_method):
            return policy.capability
    return None


def get_demo_websocket_action_capability(action: str) -> str | None:
    return _DEMO_WEBSOCKET_ACTION_CAPABILITIES.get(action)


def is_demo_guest_capability(capability: str) -> bool:
    policy = DEMO_CAPABILITY_POLICY.get(capability)
    return bool(policy and policy.guest_accessible)


def is_demo_guest_request_allowed(path: str, method: str) -> bool:
    normalized_method = method.upper()
    if normalized_method == "OPTIONS":
        return True
    capability = get_demo_http_capability(path, method)
    if capability is not None:
        return is_demo_guest_capability(capability)
    return normalized_method == "GET"
