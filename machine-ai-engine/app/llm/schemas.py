# app/llm/schemas.py
from enum import Enum
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field

class LLMProviderType(str, Enum):
    OLLAMA = "ollama"
    OPENAI = "openai"
    GEMINI = "gemini"
    AZURE_OPENAI = "azure_openai"
    CUSTOM = "custom"

class LLMTarget(str, Enum):
    """Purposes across the AI engine."""
    ROUTER = "router"                      # Fast classification / intent detection
    SUMMARIZER = "summarizer"              # Fast context window compression
    TECHNICAL_AGENT = "technical_agent"    # Manual reasoning / RAG analysis
    OPERATIONAL_AGENT = "operational_agent"# SQL generation / Telemetry
    COMMERCIAL_AGENT = "commercial_agent"  # Quotations & sales workflows
    GENERAL = "general"                    # Fallback conversational

class ModelConfig(BaseModel):
    provider: LLMProviderType
    model_name: str
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    temperature: float = 0.2
    max_tokens: Optional[int] = 2048
    extra_params: Dict[str, Any] = Field(default_factory=dict)