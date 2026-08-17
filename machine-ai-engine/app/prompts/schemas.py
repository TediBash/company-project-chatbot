# app/prompts/schemas.py
from typing import Dict, List, Any, Optional
from pydantic import BaseModel, Field

class PromptModelDefaults(BaseModel):
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None

class VersionedPrompt(BaseModel):
    name: str = Field(..., description="Unique identifier for the prompt family (e.g., 'router', 'technical_agent')")
    version: str = Field(..., description="Semantic version string (e.g., '1.0', '1.1')")
    description: str = Field(default="")
    
    # Template strings using Jinja2 syntax (e.g., {{ user_query }})
    system_prompt: str
    user_prompt: Optional[str] = None
    
    # Metadata for observability and tracking
    expected_variables: List[str] = Field(default_factory=list)
    model_defaults: PromptModelDefaults = Field(default_factory=PromptModelDefaults)

class RenderedPrompt(BaseModel):
    """The final object sent to the LLM and the Observability Tracer."""
    name: str
    version: str
    system_message: str
    user_message: str
    model_defaults: PromptModelDefaults