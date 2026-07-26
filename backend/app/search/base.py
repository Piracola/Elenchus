"""
Abstract base class for search providers.

A provider declares its own identity and configuration shape as class
attributes. Everything downstream — config normalization, secret encryption,
the REST payload, and the settings UI — is derived from those declarations, so
adding a provider means adding one module and nothing else.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Mapping
from dataclasses import dataclass
from typing import ClassVar, Literal

from pydantic import BaseModel

FieldType = Literal["text", "password"]


class SearchResult(BaseModel):
    """Unified search result across all providers."""

    title: str = ""
    url: str = ""
    snippet: str = ""
    source_engine: str = ""


@dataclass(frozen=True)
class ProviderFieldSpec:
    """One configurable field of a search provider.

    Drives backend validation, secret handling, and the rendered form field.
    """

    key: str
    label: str
    type: FieldType = "text"
    placeholder: str = ""
    helper_text: str = ""
    #: Secrets are encrypted at rest and never returned to the client.
    secret: bool = False
    #: A provider is only instantiated once all required fields are filled in.
    required: bool = False


class SearchProvider(ABC):
    """All search backends must implement this interface."""

    #: Stable identifier used in config, API payloads, and `source_engine`.
    name: ClassVar[str] = ""
    #: Human-readable name shown in settings.
    label: ClassVar[str] = ""
    #: One-line explanation shown under the label in settings.
    description: ClassVar[str] = ""
    #: Configurable fields, in display order.
    config_fields: ClassVar[tuple[ProviderFieldSpec, ...]] = ()
    #: Lower values are tried earlier when falling back. The bundled offline
    #: provider sits last so a configured API is preferred over it.
    fallback_priority: ClassVar[int] = 100

    @classmethod
    def required_field_keys(cls) -> tuple[str, ...]:
        return tuple(field.key for field in cls.config_fields if field.required)

    @classmethod
    def secret_field_keys(cls) -> tuple[str, ...]:
        return tuple(field.key for field in cls.config_fields if field.secret)

    @classmethod
    def is_configured(cls, settings: Mapping[str, str] | None) -> bool:
        """Whether this provider has everything it needs to be instantiated."""
        values = settings or {}
        return all(str(values.get(key, "") or "").strip() for key in cls.required_field_keys())

    @classmethod
    def create(cls, settings: Mapping[str, str] | None) -> SearchProvider:
        """Build an instance from its stored settings.

        The default passes every declared field as a keyword argument; providers
        with a different constructor shape override this.
        """
        values = settings or {}
        kwargs = {
            field.key: str(values.get(field.key, "") or "").strip()
            for field in cls.config_fields
        }
        return cls(**kwargs)  # type: ignore[call-arg]

    @abstractmethod
    async def search(self, query: str, num_results: int = 5) -> list[SearchResult]:
        """Execute a search and return structured results."""
        ...

    @abstractmethod
    async def is_available(self) -> bool:
        """Health check — can this provider serve requests right now?"""
        ...

    async def close(self) -> None:  # noqa: B027 - optional hook, no-op by design
        """Cleanup resources — optional, override if provider holds resources."""
        return None
