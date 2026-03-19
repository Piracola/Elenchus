from abc import ABC, abstractmethod
from typing import Any

from langchain_core.language_models import BaseChatModel

class BaseProviderClient(ABC):
    """Base interface for an LLM provider client wrapper."""
    
    @abstractmethod
    def create_client(
        self, 
        model: str, 
        api_key: str | None = None, 
        api_base_url: str | None = None,
        custom_parameters: dict[str, Any] | None = None,
        **kwargs: Any
    ) -> BaseChatModel:
        """Instantiate and return the specific Langchain BaseChatModel."""
        pass
