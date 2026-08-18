# app/agents/specialized.py
from typing import Dict, Any, Union, AsyncGenerator
from pydantic import BaseModel, Field

from app.agents.tools import ToolRegistry
from app.llm.client import UniversalLLMClient
from app.pipeline.config import active_pipeline
from app.prompts.registry import prompt_registry

class CommercialDecision(BaseModel):
    needs_quote: bool = Field(description="True ONLY if the user explicitly wants to buy, order, or get a quote.")
    part_name: str = Field(default="General Spare Part", description="The specific part to buy.")
    reasoning: str = Field(description="A brief explanation of why a quote is or is not needed.")

class BaseAgent:
    def __init__(self):
        self.llm = UniversalLLMClient()
        self.worker_model = active_pipeline.llm_routing.worker_model

    async def draft_response(self, query: str, context: Dict[str, Any]) -> Union[AsyncGenerator[str, None], Dict[str, Any]]:
        raise NotImplementedError

class TechnicalAgent(BaseAgent):
    """Feeds RAG excerpts and Roadmap state into the Jinja2 template and streams the answer."""
    async def draft_response(self, query: str, context: Dict[str, Any]) -> Union[AsyncGenerator[str, None], Dict[str, Any]]:
        
        variables = {
            "user_query": query,
            "rag_context": context.get("rag_blocks", ""),
            "roadmap_state": context.get("system_prompt", "")
        }
        
        prompt = prompt_registry.render("technical", variables)
        
        messages = [{"role": "system", "content": prompt.system_message}]
        if "messages" in context:
            messages.extend(context["messages"])
        messages.append({"role": "user", "content": prompt.user_message})

        return self.llm.stream_response(
            model_name=self.worker_model,
            messages=messages,
            temperature=prompt.model_defaults.temperature or 0.1
        )

class OperationalAgent(BaseAgent):
    """Executes SQL Tool and injects the raw data into the Jinja2 template."""
    async def draft_response(self, query: str, context: Dict[str, Any]) -> Union[AsyncGenerator[str, None], Dict[str, Any]]:
        
        telemetry_data = ToolRegistry.query_telemetry_sql("M-100", "motor_temp")
        
        variables = {
            "user_query": query,
            "telemetry_data": telemetry_data
        }
        prompt = prompt_registry.render("operational", variables)
        
        messages = [{"role": "system", "content": prompt.system_message}]
        if "messages" in context:
            messages.extend(context["messages"])
        messages.append({"role": "user", "content": prompt.user_message})

        return self.llm.stream_response(
            model_name=self.worker_model,
            messages=messages,
            temperature=prompt.model_defaults.temperature or 0.2
        )

class CommercialAgent(BaseAgent):
    """Uses LLM structured output to evaluate if a quote is needed, otherwise falls back to chat."""
    async def draft_response(self, query: str, context: Dict[str, Any]) -> Union[AsyncGenerator[str, None], Dict[str, Any]]:
        
        variables = {"user_query": query}
        prompt = prompt_registry.render("commercial", variables)
        
        messages = [
            {"role": "system", "content": prompt.system_message},
            {"role": "user", "content": prompt.user_message}
        ]
        
        # 1. Structured decision for Tool Execution
        decision: CommercialDecision = await self.llm.generate_structured(
            model_name=self.worker_model, 
            messages=messages, 
            response_schema=CommercialDecision,
            temperature=prompt.model_defaults.temperature or 0.1
        )

        # 2. Trigger HITL Tool if explicitly requested
        if decision and decision.needs_quote:
            print(f"[Commercial Agent] Triggering Quote. Reason: {decision.reasoning}")
            return ToolRegistry.create_commercial_request(
                title=f"Spare Part Order: {decision.part_name}",
                request_type="spare_parts",
                urgency="medium"
            )
            
        # 3. Standard chat fallback
        fallback_msg = [
            {"role": "system", "content": "You are a commercial agent. Answer the inquiry generally without generating a quote."}, 
            {"role": "user", "content": query}
        ]
        return self.llm.stream_response(model_name=self.worker_model, messages=fallback_msg)

class GeneralAgent(BaseAgent):
    """Handles standard greetings and fallbacks."""
    async def draft_response(self, query: str, context: Dict[str, Any]) -> Union[AsyncGenerator[str, None], Dict[str, Any]]:
        # For simplicity, fallback uses a direct message without registry rendering here
        messages = [{"role": "system", "content": "You are a helpful AROL support assistant."}]
        messages.append({"role": "user", "content": query})
        
        return self.llm.stream_response(model_name=self.worker_model, messages=messages, temperature=0.4)