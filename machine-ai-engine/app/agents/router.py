# app/agents/router.py
from typing import Literal
from pydantic import BaseModel, Field
from app.llm.client import UniversalLLMClient
from app.pipeline.config import active_pipeline
from app.prompts.registry import prompt_registry

# 1. Define the strict JSON schema we want the LLM to output
class IntentClassification(BaseModel):
    intent: Literal["technical", "commercial", "operational", "general"] = Field(
        description="The classified intent of the user's message."
    )
    reasoning: str = Field(
        description="A brief, 1-sentence explanation of why this intent was chosen."
    )

class IntentRouter:
    """Uses a fast LLM to classify user queries and route them to specialized agents."""
    
    def __init__(self):
        self.llm = UniversalLLMClient()
        self.model = active_pipeline.llm_routing.router_model

    async def route(self, query: str, user_role: str = "technician") -> Literal["technical", "commercial", "operational", "general"]:
        """
        Sends the query to the Router LLM and returns the exact agent name.
        """
        # Render the prompt dynamically using Jinja2
        variables = {
            "user_query": query,
            "user_role": user_role
        }
        prompt = prompt_registry.render(name="router", variables=variables)

        messages = [
            {"role": "system", "content": prompt.system_message},
            {"role": "user", "content": prompt.user_message}
        ]

        print(f"[Router] Analyzing intent using {self.model}...")
        
        # Call the structured generation method to enforce the Pydantic schema
        result: IntentClassification = await self.llm.generate_structured(
            model_name=self.model,
            messages=messages,
            response_schema=IntentClassification,
            temperature=prompt.model_defaults.temperature or 0.0
        )

        if result:
            print(f"[Router] Classified as: {result.intent.upper()} (Reason: {result.reasoning})")
            return result.intent
            
        # Fallback if the LLM fails or timeouts
        print("[Router] LLM failed to classify. Falling back to 'general'.")
        return "general"