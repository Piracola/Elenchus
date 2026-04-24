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
        # Separate LangChain-known kwargs from custom HTTP body params.
        # Custom params (e.g. enable_thinking for Qwen) go into model_kwargs
        # so they reach the HTTP request body.
        langchain_known_keys = {
            "temperature", "max_tokens", "streaming", "top_p",
            "timeout", "max_retries", "model_name",
        }
        custom = custom_parameters or {}
        langchain_kwargs = {k: v for k, v in kwargs.items() if k in langchain_known_keys}
        model_kwargs = {
            k: v for k, v in {**custom, **kwargs}.items()
            if k not in langchain_known_keys
        }
        client = ChatOpenAI(
            model=model,
            api_key=api_key,
            base_url=api_base_url,
            model_kwargs=model_kwargs if model_kwargs else None,
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
        langchain_known_keys = {
            "temperature", "max_tokens", "streaming", "top_p",
            "timeout", "max_retries", "model_name",
        }
        custom = custom_parameters or {}
        langchain_kwargs = {k: v for k, v in kwargs.items() if k in langchain_known_keys}
        model_kwargs = {
            k: v for k, v in {**custom, **kwargs}.items()
            if k not in langchain_known_keys
        }
        client = ChatAnthropic(
            model=model,
            api_key=api_key,
            base_url=api_base_url,
            model_kwargs=model_kwargs if model_kwargs else None,
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
        langchain_known_keys = {
            "temperature", "max_tokens", "streaming", "top_p",
            "timeout", "max_retries", "model_name",
        }
        custom = custom_parameters or {}
        langchain_kwargs = {k: v for k, v in kwargs.items() if k in langchain_known_keys}
        model_kwargs = {
            k: v for k, v in {**custom, **kwargs}.items()
            if k not in langchain_known_keys
        }
        client = ChatGoogleGenerativeAI(
            model=model,
            api_key=api_key,
            base_url=api_base_url,
            model_kwargs=model_kwargs if model_kwargs else None,
            **langchain_kwargs,
        )
        return client
