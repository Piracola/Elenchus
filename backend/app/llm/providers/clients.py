from typing import Any

from langchain_anthropic.chat_models import ChatAnthropic
from langchain_core.language_models import BaseChatModel
from langchain_google_genai.chat_models import ChatGoogleGenerativeAI
from langchain_openai.chat_models import ChatOpenAI

from app.llm.providers.base import BaseProviderClient
from app.llm.request_params import (
    build_non_openai_langchain_kwargs,
    build_openai_langchain_kwargs,
)


class OpenAIProviderClient(BaseProviderClient):
    """Client wrapper for OpenAI-compatible providers."""

    def create_client(
        self,
        model: str,
        api_key: str | None = None,
        api_base_url: str | None = None,
        custom_parameters: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> BaseChatModel:
        langchain_kwargs = build_openai_langchain_kwargs(
            custom_parameters=custom_parameters,
            kwargs=kwargs,
        )
        client = ChatOpenAI(
            model=model,
            api_key=api_key,
            base_url=api_base_url,
            **langchain_kwargs,
        )
        return client


class AnthropicProviderClient(BaseProviderClient):
    """Client wrapper for Anthropic Claude."""

    def create_client(
        self,
        model: str,
        api_key: str | None = None,
        api_base_url: str | None = None,
        custom_parameters: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> BaseChatModel:
        langchain_kwargs = build_non_openai_langchain_kwargs(
            provider_type="anthropic",
            custom_parameters=custom_parameters,
            kwargs=kwargs,
        )
        client = ChatAnthropic(
            model=model,
            api_key=api_key,
            base_url=api_base_url,
            **langchain_kwargs,
        )
        return client


class GeminiProviderClient(BaseProviderClient):
    """Client wrapper for Google Gemini."""

    def create_client(
        self,
        model: str,
        api_key: str | None = None,
        api_base_url: str | None = None,
        custom_parameters: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> BaseChatModel:
        langchain_kwargs = build_non_openai_langchain_kwargs(
            provider_type="gemini",
            custom_parameters=custom_parameters,
            kwargs=kwargs,
        )
        client = ChatGoogleGenerativeAI(
            model=model,
            api_key=api_key,
            base_url=api_base_url,
            **langchain_kwargs,
        )
        return client
