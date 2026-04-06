from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain_google_genai import ChatGoogleGenerativeAI

from app.agents.providers.base import BaseProviderClient


def build_thinking_parameters(
    custom_parameters: dict[str, Any],
    enable_thinking: bool,
) -> dict[str, Any]:
    """
    根据模型服务商和配置，构建通用的思考模式参数。
    
    不同模型服务商使用不同的思考模式参数：
    - vLLM/OpenAI兼容: extra_body={"chat_template_kwargs": {"enable_thinking": true}}
    - DeepSeek: extra_body={"thinking": {"type": "enabled"}}
    - 其他：可能通过 system prompt 或自定义参数
    
    Args:
        custom_parameters: 用户自定义参数
        enable_thinking: 是否启用思考模式
    
    Returns:
        构建后的参数字典
    """
    if not enable_thinking:
        return custom_parameters
    
    params = dict(custom_parameters or {})
    
    # 检查用户是否已经在 custom_parameters 中设置了思考参数
    # 如果已设置，不覆盖（让用户自定义优先）
    has_thinking_configured = (
        "extra_body" in params or
        "thinking" in params or
        "enable_thinking" in params or
        "chat_template_kwargs" in params
    )
    
    if has_thinking_configured:
        # 用户已手动配置，不覆盖
        return params
    
    # 自动添加通用的思考模式参数
    # 使用 extra_body.chat_template_kwargs.enable_thinking 是最通用的方式
    # 适用于 vLLM、大多数 OpenAI 兼容服务
    params["extra_body"] = {
        "chat_template_kwargs": {
            "enable_thinking": True
        }
    }
    
    return params


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
        # 处理思考模式参数
        enable_thinking = custom_parameters.pop("enable_thinking", False) if custom_parameters else False
        processed_params = build_thinking_parameters(
            custom_parameters or {},
            enable_thinking,
        )
        
        # ChatOpenAI natively handles base_url overrides
        # and seamlessly falls back to os.environ["OPENAI_API_KEY"] if key is omit.
        client_kwargs: dict[str, Any] = {
            "model": model,
            **(processed_params or {}),
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
