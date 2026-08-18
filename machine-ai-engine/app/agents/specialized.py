# app/agents/specialized.py
from typing import Dict, Any, Union, AsyncGenerator, Tuple, List
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

    async def draft_response(self, query: str, context: Dict[str, Any], tracer: Any = None) -> Tuple[Union[AsyncGenerator[str, None], Dict[str, Any]], List[Dict[str, Any]]]:
        raise NotImplementedError

class TechnicalAgent(BaseAgent):
    async def draft_response(self, query: str, context: Dict[str, Any], tracer: Any = None) -> Tuple[Union[AsyncGenerator[str, None], Dict[str, Any]], List[Dict[str, Any]]]:
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

        stream = self.llm.stream_response(
            model_name=self.worker_model,
            messages=messages,
            temperature=prompt.model_defaults.temperature or 0.1
        )
        return stream, messages

class OperationalAgent(BaseAgent):
    async def draft_response(self, query: str, context: Dict[str, Any], tracer: Any = None) -> Tuple[Union[AsyncGenerator[str, None], Dict[str, Any]], List[Dict[str, Any]]]:
        # Execute Tool & Log it
        telemetry_data = ToolRegistry.query_telemetry_sql("M-100", "motor_temp")
        
        if tracer:
            tracer.add_step(
                step_name="SQL Database Tool Execution",
                action_type="tool_call",
                details={"target_machine": "M-100", "metric": "motor_temp", "result": telemetry_data}
            )
        
        variables = {"user_query": query, "telemetry_data": telemetry_data}
        prompt = prompt_registry.render("operational", variables)
        
        messages = [{"role": "system", "content": prompt.system_message}]
        if "messages" in context:
            messages.extend(context["messages"])
        messages.append({"role": "user", "content": prompt.user_message})

        stream = self.llm.stream_response(
            model_name=self.worker_model,
            messages=messages,
            temperature=prompt.model_defaults.temperature or 0.2
        )
        return stream, messages

class CommercialAgent(BaseAgent):
    async def draft_response(self, query: str, context: Dict[str, Any], tracer: Any = None) -> Tuple[Union[AsyncGenerator[str, None], Dict[str, Any]], List[Dict[str, Any]]]:
        variables = {"user_query": query}
        prompt = prompt_registry.render("commercial", variables)
        
        messages = [
            {"role": "system", "content": prompt.system_message},
            {"role": "user", "content": prompt.user_message}
        ]
        
        decision: CommercialDecision = await self.llm.generate_structured(
            model_name=self.worker_model, 
            messages=messages, 
            response_schema=CommercialDecision,
            temperature=prompt.model_defaults.temperature or 0.1
        )

        if tracer and decision:
            tracer.add_llm_step("Commercial HITL Decision", self.worker_model, messages, decision.model_dump_json(), decision.model_dump())

        if decision and decision.needs_quote:
            tool_dict = ToolRegistry.create_commercial_request(
                title=f"Spare Part Order: {decision.part_name}",
                request_type="spare_parts",
                urgency="medium"
            )
            if tracer:
                tracer.add_step("HITL Tool Triggered", "tool_call", tool_dict)
            return tool_dict, messages
            
        fallback_msg = [{"role": "system", "content": "You are a commercial agent. Answer generally."}, {"role": "user", "content": query}]
        return self.llm.stream_response(model_name=self.worker_model, messages=fallback_msg), fallback_msg

class GeneralAgent(BaseAgent):
    async def draft_response(self, query: str, context: Dict[str, Any], tracer: Any = None) -> Tuple[Union[AsyncGenerator[str, None], Dict[str, Any]], List[Dict[str, Any]]]:
        messages = [{"role": "system", "content": "You are a helpful AROL support assistant."}, {"role": "user", "content": query}]
        return self.llm.stream_response(model_name=self.worker_model, messages=messages, temperature=0.4), messages