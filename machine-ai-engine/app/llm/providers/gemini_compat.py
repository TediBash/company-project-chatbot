# app/llm/providers/gemini_compat.py
from app.llm.providers.openai_compat import OpenAICompatibleProvider
from app.llm.schemas import ModelConfig

class GeminiProvider(OpenAICompatibleProvider):
    def __init__(self, config: ModelConfig):
        # Default Gemini OpenAI-compatible endpoint if not explicitly provided
        if not config.base_url:
            config.base_url = "https://generativelanguage.googleapis.com/v1beta/openai/"
        super().__init__(config)