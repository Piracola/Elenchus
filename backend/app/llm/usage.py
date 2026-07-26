"""Token usage extraction shared by all model invocation paths."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class UsageRecord:
    """Token usage for one completed model invocation."""

    input_tokens: int
    output_tokens: int
    total_tokens: int
    provider_type: str | None = None
    model: str | None = None

    def as_payload(self) -> dict[str, Any]:
        return {
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "total_tokens": self.total_tokens,
            "provider_type": self.provider_type,
            "model": self.model,
        }


UsageCallback = Callable[[UsageRecord], Awaitable[None]]


def _coerce_token_count(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)) and value >= 0:
        return int(value)
    return None


def usage_from_openai_payload(usage: Any) -> dict[str, int] | None:
    """Parse an OpenAI-style usage object: prompt/completion/total_tokens."""
    if not isinstance(usage, dict):
        return None
    input_tokens = _coerce_token_count(
        usage.get("prompt_tokens", usage.get("input_tokens"))
    )
    output_tokens = _coerce_token_count(
        usage.get("completion_tokens", usage.get("output_tokens"))
    )
    total_tokens = _coerce_token_count(usage.get("total_tokens"))
    if input_tokens is None and output_tokens is None and total_tokens is None:
        return None
    input_tokens = input_tokens or 0
    output_tokens = output_tokens or 0
    if total_tokens is None:
        total_tokens = input_tokens + output_tokens
    return {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
    }


def extract_usage_from_message(message: Any) -> dict[str, int] | None:
    """Read token usage from a LangChain message, trying all known locations."""
    usage_metadata = getattr(message, "usage_metadata", None)
    if isinstance(usage_metadata, dict):
        parsed = usage_from_openai_payload(usage_metadata)
        if parsed is not None:
            return parsed

    response_metadata = getattr(message, "response_metadata", None)
    if isinstance(response_metadata, dict):
        for key in ("token_usage", "usage", "usage_metadata"):
            parsed = usage_from_openai_payload(response_metadata.get(key))
            if parsed is not None:
                return parsed

    return None


async def emit_usage(
    on_usage: UsageCallback | None,
    message: Any,
    *,
    provider_type: str | None = None,
    model: str | None = None,
) -> None:
    """Invoke the usage callback when the message carries token counts.

    Never raises: usage accounting must not break a successful invocation.
    """
    if on_usage is None:
        return
    parsed = extract_usage_from_message(message)
    if parsed is None:
        return
    try:
        await on_usage(
            UsageRecord(
                input_tokens=parsed["input_tokens"],
                output_tokens=parsed["output_tokens"],
                total_tokens=parsed["total_tokens"],
                provider_type=provider_type,
                model=model,
            )
        )
    except Exception:  # pragma: no cover - defensive
        import logging

        logging.getLogger(__name__).warning(
            "Usage callback failed; token stats for this call are lost",
            exc_info=True,
        )
