from __future__ import annotations

import inspect
from typing import Any

import httpx
from openai import AsyncOpenAI


REQUEST_TIMEOUT_SECONDS = 20.0
ANTHROPIC_DEFAULT_BASE_URL = "https://api.anthropic.com/v1"
GEMINI_DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"


def normalize_model_ids(models: list[str]) -> list[str]:
    seen: set[str] = set()
    normalized: list[str] = []
    for model in models:
        value = str(model or "").strip()
        if value.startswith("models/"):
            value = value.removeprefix("models/")
        if not value or value in seen:
            continue
        seen.add(value)
        normalized.append(value)
    return normalized


def _join_api_path(base_url: str, path: str) -> str:
    return f"{base_url.rstrip('/')}/{path.lstrip('/')}"


async def _close_openai_client(client: AsyncOpenAI) -> None:
    result = client.close()
    if inspect.isawaitable(result):
        await result


async def _fetch_openai_models(
    *,
    api_key: str,
    api_base_url: str | None,
) -> list[str]:
    client = AsyncOpenAI(api_key=api_key, base_url=api_base_url)
    try:
        response = await client.models.list()
        return normalize_model_ids([
            str(getattr(model, "id", "") or "")
            for model in (getattr(response, "data", None) or [])
        ])
    finally:
        await _close_openai_client(client)


async def _fetch_anthropic_models(
    *,
    api_key: str,
    api_base_url: str | None,
) -> list[str]:
    base_url = (api_base_url or ANTHROPIC_DEFAULT_BASE_URL).rstrip("/")
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
        response = await client.get(
            _join_api_path(base_url, "models"),
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
            },
        )
        response.raise_for_status()
        data = response.json()
    return normalize_model_ids([
        str(item.get("id") or item.get("name") or "")
        for item in (data.get("data") or [])
        if isinstance(item, dict)
    ])


async def _fetch_gemini_models(
    *,
    api_key: str,
    api_base_url: str | None,
) -> list[str]:
    base_url = (api_base_url or GEMINI_DEFAULT_BASE_URL).rstrip("/")
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
        response = await client.get(
            _join_api_path(base_url, "models"),
            params={"key": api_key},
        )
        response.raise_for_status()
        data = response.json()
    return normalize_model_ids([
        str(item.get("name") or item.get("id") or "")
        for item in (data.get("models") or [])
        if isinstance(item, dict)
    ])


async def fetch_provider_models(
    *,
    provider_type: str,
    api_key: str,
    api_base_url: str | None,
) -> list[str]:
    normalized_provider = (provider_type or "openai").strip().lower()
    if not api_key.strip():
        raise ValueError("请先填写 API 密钥，或选择一个已保存密钥的服务商。")

    if normalized_provider == "anthropic":
        return await _fetch_anthropic_models(
            api_key=api_key,
            api_base_url=api_base_url,
        )
    if normalized_provider == "gemini":
        return await _fetch_gemini_models(
            api_key=api_key,
            api_base_url=api_base_url,
        )
    return await _fetch_openai_models(
        api_key=api_key,
        api_base_url=api_base_url,
    )


def format_model_fetch_error(error: Exception) -> str:
    if isinstance(error, ValueError):
        return str(error)
    if isinstance(error, httpx.HTTPStatusError):
        status_code = error.response.status_code
        try:
            payload: Any = error.response.json()
        except ValueError:
            payload = error.response.text
        detail = payload
        if isinstance(payload, dict):
            detail = payload.get("error") or payload.get("message") or payload.get("detail") or payload
        return f"服务商返回 {status_code}：{detail}"
    message = str(error).strip()
    return message or "连接服务商失败，请检查密钥和 API Base URL。"
