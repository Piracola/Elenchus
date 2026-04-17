from typing import Any

from langchain_anthropic.chat_models import ChatAnthropic
from langchain_core.language_models import BaseChatModel
from langchain_google_genai.chat_models import ChatGoogleGenerativeAI
from langchain_openai.chat_models import ChatOpenAI

from app.llm.providers.base import BaseProviderClient


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
        merged_kwargs = {**(custom_parameters or {}), **kwargs}
        client = ChatOpenAI(
            model=model,
            api_key=api_key,
            base_url=api_base_url,
            **merged_kwargs,
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
        merged_kwargs = {**(custom_parameters or {}), **kwargs}
        client = ChatAnthropic(
            model=model,
            api_key=api_key,
            base_url=api_base_url,
            **merged_kwargs,
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
        merged_kwargs = {**(custom_parameters or {}), **kwargs}
        client = ChatGoogleGenerativeAI(
            model=model,
            api_key=api_key,
            base_url=api_base_url,
            **merged_kwargs,
        )
        return client
