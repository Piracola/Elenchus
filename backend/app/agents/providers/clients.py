from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain_google_genai import ChatGoogleGenerativeAI

from app.agents.providers.base import BaseProviderClient


class OpenAIProviderClient(BaseProviderClient):
    """Wrapper for any OpenAI-compatible endpoint (OpenAI, DeepSeek, AiHubMix, Ollama, etc.)"""
    
    def create_client(
        self, 
        model: str, 
        api_key: str | None = None, 
        api_base_url: str | None = None,
        custom_parameters: dict[str, Any] | None = None,
        **kwargs: Any
    ) -> BaseChatModel:
        # ChatOpenAI natively handles base_url overrides 
        # and seamlessly falls back to os.environ["OPENAI_API_KEY"] if key is omit.
        client_kwargs: dict[str, Any] = {
            "model": model,
            **(custom_parameters or {}),
            **kwargs
        }
        if api_key:
            client_kwargs["api_key"] = api_key
        if api_base_url:
            client_kwargs["base_url"] = api_base_url
            
        return ChatOpenAI(**client_kwargs)


class AnthropicProviderClient(BaseProviderClient):
    """Wrapper for Anthropic's Claude API."""
    
    def create_client(
        self, 
        model: str, 
        api_key: str | None = None, 
        api_base_url: str | None = None,
        custom_parameters: dict[str, Any] | None = None,
        **kwargs: Any
    ) -> BaseChatModel:
        client_kwargs: dict[str, Any] = {
            "model": model,
            **(custom_parameters or {}),
            **kwargs
        }
        if api_key:
            client_kwargs["api_key"] = api_key
        if api_base_url:
            client_kwargs["base_url"] = api_base_url
            
        return ChatAnthropic(**client_kwargs)


class GeminiProviderClient(BaseProviderClient):
    """Wrapper for Google Gemini API."""
    
    def create_client(
        self, 
        model: str, 
        api_key: str | None = None, 
        api_base_url: str | None = None,
        custom_parameters: dict[str, Any] | None = None,
        **kwargs: Any
    ) -> BaseChatModel:
        client_kwargs: dict[str, Any] = {
            "model": model,
            **(custom_parameters or {}),
            **kwargs
        }
        if api_key:
            client_kwargs["google_api_key"] = api_key
        
        # Note: Gemini SDK doesn't always support base_url overrides directly mapped. 
        # If needed, can pass transport options in Langchain, but typically not proxied.
            
        return ChatGoogleGenerativeAI(**client_kwargs)
