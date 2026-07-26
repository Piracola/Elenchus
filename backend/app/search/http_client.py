"""Shared HTTP plumbing for API-backed search providers."""

from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT_SECONDS = 20.0


def new_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS)


async def post_json(
    client: httpx.AsyncClient,
    url: str,
    *,
    provider: str,
    json: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
) -> Any | None:
    """POST and return parsed JSON, or None when the call fails.

    Search is always an enhancement, never a hard dependency, so transport and
    decoding failures are logged and swallowed here instead of propagating.
    """
    try:
        response = await client.post(url, json=json, headers=headers)
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.error("%s search failed: %s", provider, exc)
        return None


async def get_json(
    client: httpx.AsyncClient,
    url: str,
    *,
    provider: str,
    params: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
) -> Any | None:
    """GET and return parsed JSON, or None when the call fails."""
    try:
        response = await client.get(url, params=params, headers=headers)
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.error("%s search failed: %s", provider, exc)
        return None


def first_text(item: dict[str, Any], keys: tuple[str, ...]) -> str:
    """First non-empty string among `keys`, stripped."""
    for key in keys:
        value = item.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def dig_items(data: Any, path: tuple[str, ...] = ()) -> list[Any]:
    """Walk `path` into a JSON payload and return the list found there."""
    current: Any = data
    for key in path:
        if not isinstance(current, dict):
            return []
        current = current.get(key)
    return current if isinstance(current, list) else []
