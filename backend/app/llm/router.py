import logging
from typing import Any

from langchain_core.language_models import BaseChatModel

from app.llm.providers.base import BaseProviderClient
from app.llm.providers.clients import (
    OpenAIProviderClient,
    AnthropicProviderClient,
    GeminiProviderClient,
)

logger = logging.getLogger(__name__)

# Maximum number of cached LLM client instances
_MAX_CLIENT_CACHE_SIZE = 32


class LLMRouter:
    """
    Lightweight router registry for directing LLM calls to the official SDKs.

    Includes an LRU-style client cache to reuse HTTP connections across
    invocations with the same (provider_type, model, api_base_url) combination.
    """

    def __init__(self):
        self._registry: dict[str, BaseProviderClient] = {
            "openai": OpenAIProviderClient(),
            "anthropic": AnthropicProviderClient(),
            "gemini": GeminiProviderClient(),
        }
        # Client cache: (provider_type, model, api_base_url) -> BaseChatModel
        self._client_cache: dict[tuple[str, str, str | None], BaseChatModel] = {}

    def register_provider(self, provider_type: str, client: BaseProviderClient):
        """Register a new provider type dynamically."""
        self._registry[provider_type.lower()] = client

    def _cache_key(
        self, provider_type: str, model: str, api_base_url: str | None
    ) -> tuple[str, str, str | None]:
        return (provider_type, model, api_base_url)

    def get_client(
        self,
        provider_type: str,
        model: str,
        api_key: str | None = None,
        api_base_url: str | None = None,
        custom_parameters: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> BaseChatModel:
        """
        Route the request to the matching provider and return its instantiated client.

        Clients are cached by (provider_type, model, api_base_url) to enable
        HTTP connection pooling and reuse. Temperature and streaming kwargs
        are applied on the cached instance if compatible, otherwise a new
        instance is created.
        Defaults to 'openai' (compatible) if provider not found or not specified.
        """
        provider_type = provider_type.lower().strip() if provider_type else "openai"

        provider_impl = self._registry.get(provider_type)
        if not provider_impl:
            logger.warning(
                f"Provider type '{provider_type}' not found in registry. Falling back to 'openai' compatible."
            )
            provider_impl = self._registry["openai"]

        # Check cache for a reusable client
        key = self._cache_key(provider_type, model, api_base_url)
        cached_client = self._client_cache.get(key)

        if cached_client is not None:
            # If temperature or streaming differs, we need a new instance
            # because those are set at construction time for most providers
            current_temp = getattr(cached_client, "temperature", None)
            requested_temp = kwargs.get("temperature")
            current_streaming = getattr(cached_client, "streaming", None)
            requested_streaming = kwargs.get("streaming")

            if (requested_temp is None or current_temp == requested_temp) and \
               (requested_streaming is None or current_streaming == requested_streaming):
                return cached_client

            # Evict the old entry — new instance will replace it
            del self._client_cache[key]

        client = provider_impl.create_client(
            model=model,
            api_key=api_key,
            api_base_url=api_base_url,
            custom_parameters=custom_parameters,
            **kwargs,
        )

        # Cache the new client, evict oldest entry if cache is full
        if len(self._client_cache) >= _MAX_CLIENT_CACHE_SIZE:
            oldest_key = next(iter(self._client_cache))
            del self._client_cache[oldest_key]
        self._client_cache[key] = client

        return client

    def clear_cache(self) -> None:
        """Clear all cached client instances."""
        self._client_cache.clear()


def get_llm_router() -> LLMRouter:
    """Return the shared LLM router singleton."""
    global _router
    if _router is None:
        _router = LLMRouter()
    return _router


_router: LLMRouter | None = None
