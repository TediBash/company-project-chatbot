# app/llm/client.py
import os
from typing import AsyncGenerator, Dict, Any, List, Optional
from litellm import acompletion
from pydantic import BaseModel
from app.pipeline.config import active_pipeline

class UniversalLLMClient:
    """
    Independent module to handle all LLM inferences using configuration endpoints and tokens.
    """

    @staticmethod
    def _apply_environment_configs():
        """Injects configuration endpoints and tokens into environment variables for LiteLLM."""
        if active_pipeline.endpoints.openai_api_key:
            os.environ["OPENAI_API_KEY"] = active_pipeline.endpoints.openai_api_key
        if active_pipeline.endpoints.openai_api_base:
            os.environ["OPENAI_API_BASE"] = active_pipeline.endpoints.openai_api_base

        if active_pipeline.endpoints.gemini_api_key:
            os.environ["GEMINI_API_KEY"] = active_pipeline.endpoints.gemini_api_key
        if active_pipeline.endpoints.gemini_api_base:
            os.environ["GEMINI_API_BASE"] = active_pipeline.endpoints.gemini_api_base

        # Ollama local base URL
        os.environ["OLLAMA_API_BASE"] = active_pipeline.endpoints.ollama_api_base

    async def stream_response(
        self, 
        model_name: str, 
        messages: List[Dict[str, str]], 
        temperature: float = 0.3,
        max_tokens: int = 1500
    ) -> AsyncGenerator[str, None]:
        self._apply_environment_configs()
        try:
            response = await acompletion(
                model=model_name,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=True
            )
            async for chunk in response:
                if chunk.choices[0].delta.content is not None:
                    yield chunk.choices[0].delta.content
        except Exception as e:
            print(f"[LLM Streaming Error - {model_name}] {e}")
            yield " [Connection to LLM failed.] "
            
    @staticmethod
    async def generate_structured(
        model_name: str, 
        messages: List[Dict[str, str]], 
        response_schema: BaseModel,
        temperature: float = 0.1
    ) -> Optional[BaseModel]:
        """
        Forces the LLM to output a strict JSON object matching the Pydantic schema.
        Perfect for the Intent Router and Roadmap Generator.
        """
        try:
            response = await acompletion(
                model=model_name,
                messages=messages,
                temperature=temperature,
                response_format=response_schema,
            )
            
            raw_json_str = response.choices[0].message.content
            
            # Parse the raw string back into the Pydantic model
            return response_schema.model_validate_json(raw_json_str)

        except Exception as e:
            print(f"[LLM Structured Gen Error - {model_name}] {e}")
            return None