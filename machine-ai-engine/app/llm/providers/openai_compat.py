# app/llm/providers/openai_compat.py
from typing import AsyncGenerator, List, Dict, Optional
from openai import AsyncOpenAI
from app.llm.base import BaseLLMProvider
from app.llm.schemas import ModelConfig

class OpenAICompatibleProvider(BaseLLMProvider):
    def __init__(self, config: ModelConfig):
        super().__init__(config)
        self.client = AsyncOpenAI(
            base_url=self.config.base_url,
            api_key=self.config.api_key or "local-placeholder"
        )

    async def acomplete(
        self, 
        messages: List[Dict[str, str]], 
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None
    ) -> str:
        response = await self.client.chat.completions.create(
            model=self.config.model_name,
            messages=messages,
            temperature=temperature if temperature is not None else self.config.temperature,
            max_tokens=max_tokens if max_tokens is not None else self.config.max_tokens,
            **self.config.extra_params
        )
        return response.choices[0].message.content or ""

    async def astream(
        self, 
        messages: List[Dict[str, str]], 
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None
    ) -> AsyncGenerator[str, None]:
        stream = await self.client.chat.completions.create(
            model=self.config.model_name,
            messages=messages,
            temperature=temperature if temperature is not None else self.config.temperature,
            max_tokens=max_tokens if max_tokens is not None else self.config.max_tokens,
            stream=True,
            **self.config.extra_params
        )
        async for chunk in stream:
            token = chunk.choices[0].delta.content or ""
            if token:
                yield token