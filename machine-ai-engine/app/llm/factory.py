# app/llm/factory.py
from typing import Dict
from app.config import settings
from app.llm.base import BaseLLMProvider
from app.llm.schemas import LLMTarget, LLMProviderType, ModelConfig
from app.llm.providers.openai_compat import OpenAICompatibleProvider
from app.llm.providers.gemini_compat import GeminiProvider

class LLMRegistry:
    def __init__(self):
        self._instances: Dict[LLMTarget, BaseLLMProvider] = {}
        self._configs: Dict[LLMTarget, ModelConfig] = self._load_target_configs()

    def _load_target_configs(self) -> Dict[LLMTarget, ModelConfig]:
        """Maps targets/purposes to their designated configurations defined in settings."""
        return {
            # 1. Fast Router (e.g. Qwen 7B / Llama 8B on Ollama or GPT-4o-mini)
            LLMTarget.ROUTER: ModelConfig(
                provider=LLMProviderType(settings.router_provider),
                model_name=settings.router_model_name,
                base_url=settings.router_base_url,
                api_key=settings.router_api_key,
                temperature=0.0
            ),
            # 2. Fast Summarizer
            LLMTarget.SUMMARIZER: ModelConfig(
                provider=LLMProviderType(settings.summarizer_provider),
                model_name=settings.summarizer_model_name,
                base_url=settings.summarizer_base_url,
                api_key=settings.summarizer_api_key,
                temperature=0.2
            ),
            # 3. Technical RAG Agent (e.g. Llama 70B / Gemini Pro / GPT-4o)
            LLMTarget.TECHNICAL_AGENT: ModelConfig(
                provider=LLMProviderType(settings.technical_agent_provider),
                model_name=settings.technical_agent_model_name,
                base_url=settings.technical_agent_base_url,
                api_key=settings.technical_agent_api_key,
                temperature=0.1
            ),
            # 4. Operational IoT Agent (Precise SQL generation)
            LLMTarget.OPERATIONAL_AGENT: ModelConfig(
                provider=LLMProviderType(settings.operational_agent_provider),
                model_name=settings.operational_agent_model_name,
                base_url=settings.operational_agent_base_url,
                api_key=settings.operational_agent_api_key,
                temperature=0.0
            ),
            # 5. Commercial Agent
            LLMTarget.COMMERCIAL_AGENT: ModelConfig(
                provider=LLMProviderType(settings.commercial_agent_provider),
                model_name=settings.commercial_agent_model_name,
                base_url=settings.commercial_agent_base_url,
                api_key=settings.commercial_agent_api_key,
                temperature=0.2
            ),
            # Fallback general
            LLMTarget.GENERAL: ModelConfig(
                provider=LLMProviderType(settings.general_provider),
                model_name=settings.general_model_name,
                base_url=settings.general_base_url,
                api_key=settings.general_api_key,
                temperature=0.3
            ),
        }

    def get_llm(self, target: LLMTarget = LLMTarget.GENERAL) -> BaseLLMProvider:
        """Returns a cached provider instance for the specific target purpose."""
        if target not in self._instances:
            config = self._configs.get(target) or self._configs[LLMTarget.GENERAL]
            
            if config.provider in (LLMProviderType.OPENAI, LLMProviderType.OLLAMA, LLMProviderType.CUSTOM):
                self._instances[target] = OpenAICompatibleProvider(config)
            elif config.provider == LLMProviderType.GEMINI:
                self._instances[target] = GeminiProvider(config)
            else:
                raise ValueError(f"Unsupported LLM provider type: {config.provider}")

        return self._instances[target]

# Global singleton factory
registry = LLMRegistry()

def get_llm(target: LLMTarget = LLMTarget.GENERAL) -> BaseLLMProvider:
    return registry.get_llm(target)