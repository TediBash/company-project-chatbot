# app/agents/specialized.py
import asyncio
from typing import Dict, Any, Union, AsyncGenerator
from app.agents.tools import ToolRegistry
from app.llm.client import UniversalLLMClient

class BaseAgent:
    async def draft_response(self, query: str, context: Dict[str, Any]) -> Union[str, Dict[str, Any]]:
        raise NotImplementedError

WORKER_MODEL = "ollama/qwen2.5:7b" 

class TechnicalAgent(BaseAgent):
    def __init__(self):
        self.llm = UniversalLLMClient()

    async def draft_response(self, query: str, context: Dict[str, Any]) -> AsyncGenerator[str, None]:
        """
        Uses the context (RAG + Roadmap) to generate a streaming response 
        via the local Qwen/Ollama worker.
        """
        # 1. Format the messages array for the LLM
        messages = [
            {"role": "system", "content": context["system_prompt"]},
        ]
        
        # Add short-term history if available
        if "messages" in context:
            messages.extend(context["messages"])
            
        # Add the current user query
        messages.append({"role": "user", "content": query})

        # 2. Return the active stream
        return self.llm.stream_response(
            model_name=WORKER_MODEL, 
            messages=messages,
            temperature=0.2 # Low temp for technical accuracy
        )

class OperationalAgent(BaseAgent):
    async def draft_response(self, query: str, context: Dict[str, Any]) -> Union[str, Dict[str, Any]]:
        # This agent autonomously calls the SQL tool
        await asyncio.sleep(0.5)
        telemetry_data = ToolRegistry.query_telemetry_sql("M-100", "motor_temp")
        
        await asyncio.sleep(0.5)
        return f"I checked the live telemetry. The current status is: {telemetry_data}. You are safely below the warning threshold."

class CommercialAgent(BaseAgent):
    async def draft_response(self, query: str, context: Dict[str, Any]) -> Union[str, Dict[str, Any]]:
        # If the user wants a quote, the agent triggers the HITL tool instead of text
        await asyncio.sleep(1.0)
        
        if "quote" in query.lower() or "order" in query.lower():
            # Trigger the Human-In-The-Loop approval card on the frontend
            return ToolRegistry.create_commercial_request(
                title="Spare Part Order: Capping Head O-Rings",
                request_type="spare_parts",
                urgency="high"
            )
            
        return "Our commercial team can help you with pricing. Would you like me to generate a formal request for you?"

class GeneralAgent(BaseAgent):
    async def draft_response(self, query: str, context: Dict[str, Any]) -> Union[str, Dict[str, Any]]:
        await asyncio.sleep(0.5)
        return "I am the AROL Support Assistant. How can I help you today?"