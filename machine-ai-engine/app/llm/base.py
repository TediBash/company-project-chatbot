# app/llm/base.py
from abc import ABC, abstractmethod
from typing import AsyncGenerator, List, Dict, Any, Optional
from app.llm.schemas import ModelConfig

class BaseLLMProvider(ABC):
    def __init__(self, config: ModelConfig):
        self.config = config

    @abstractmethod
    async def acomplete(
        self, 
        messages: List[Dict[str, str]], 
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None
    ) -> str:
        """Standard non-streaming generation."""
        pass

    @abstractmethod
    async def astream(
        self, 
        messages: List[Dict[str, str]], 
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None
    ) -> AsyncGenerator[str, None]:
        """Streaming token generator for SSE."""
        pass