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


class LLMRouter:
    """
    Lightweight router registry for directing LLM calls to the official SDKs.
    """

    def __init__(self):
        self._registry: dict[str, BaseProviderClient] = {
            "openai": OpenAIProviderClient(),
            "anthropic": AnthropicProviderClient(),
            "gemini": GeminiProviderClient(),
        }

    def register_provider(self, provider_type: str, client: BaseProviderClient):
        """Register a new provider type dynamically."""
        self._registry[provider_type.lower()] = client

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
        Defaults to 'openai' (compatible) if provider not found or not specified.
        """
        provider_type = provider_type.lower().strip() if provider_type else "openai"

        provider_impl = self._registry.get(provider_type)
        if not provider_impl:
            logger.warning(
                f"Provider type '{provider_type}' not found in registry. Hacking back to 'openai' compatible."
            )
            provider_impl = self._registry["openai"]

        return provider_impl.create_client(
            model=model,
            api_key=api_key,
            api_base_url=api_base_url,
            custom_parameters=custom_parameters,
            **kwargs,
        )


def get_llm_router() -> LLMRouter:
    """Return the shared LLM router singleton."""
    global _router
    if _router is None:
        _router = LLMRouter()
    return _router


_router: LLMRouter | None = None
