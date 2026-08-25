# app/agents/specialized.py
from typing import Dict, Any, Union, AsyncGenerator, Tuple, List
from pydantic import BaseModel, Field
import asyncio

from app.agents.tools import ToolRegistry
from app.llm.client import UniversalLLMClient
from app.pipeline.config import active_pipeline
from app.prompts.registry import prompt_registry

from app.tools.operational import (
    get_machine_configuration,
    query_telemetry,
    query_alarms,
    query_maintenance_tickets
)

from app.tools.commercial import (
    get_spare_parts_catalog,
    get_order_history,
    get_purchase_details,
    get_quotation_history
)

from app.tools.commercial import get_spare_parts_catalog, get_order_history

class CommercialDecision(BaseModel):
    needs_quote: bool = Field(
        description="Set to True ONLY if the user explicitly asks to CREATE a new order, BUY a new part, or REQUEST a new quote. Set to False if they are just asking to view past quotes, revisions, or history."
    )
    part_name: str = Field(
        default="General Spare Part", 
        description="The specific part to buy (if applicable)."
    )
    reasoning: str = Field(
        description="A brief explanation of why a quote is or is not needed based on the strict rules."
    )

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
        # 1. Extract session credentials
        machine_id = context.get("active_machine_id", "unknown")
        auth_token = context.get("auth_token", "")
        
        # 2. Execute all Node.js API Tools Concurrently for maximum speed!
        config_data, telemetry_data, alarms_data, tickets_data = await asyncio.gather(
            get_machine_configuration(machine_id, auth_token),
            query_telemetry(machine_id, auth_token),
            query_alarms(machine_id, auth_token),
            query_maintenance_tickets(machine_id, auth_token)
        )
        
        if tracer:
            tracer.add_step(
                step_name="Operational API Tools Execution",
                action_type="tool_call",
                details={
                    "target_machine": machine_id,
                    "endpoints_called": ["config", "telemetry", "alarms", "maintenance"],
                    "responses": {
                        "config": config_data,
                        "telemetry": telemetry_data,
                        "alarms": alarms_data,
                        "maintenance": tickets_data
                    }
                }
            )
        
        # 3. Inject all the data into the prompt template
        variables = {
            "user_query": query, 
            "machine_config": config_data,
            "telemetry_data": telemetry_data,
            "alarms_data": alarms_data,
            "maintenance_data": tickets_data
        }
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
        # 1. Extract session credentials
        auth_token = context.get("auth_token", "")
        company_id = context.get("company_id", "")
        active_machine_id = context.get("active_machine_id", "")
        active_machine_name = context.get("active_machine_name", "Unknown Model")
        
        # 2. Fetch All Commercial Data Concurrently!
        parts_data, orders_data, purchase_data, quote_data = await asyncio.gather(
            get_spare_parts_catalog(active_machine_name, auth_token),
            get_order_history(company_id, auth_token),
            get_purchase_details(active_machine_id, auth_token),
            get_quotation_history(active_machine_id, auth_token)
        )
        
        if tracer:
            tracer.add_step(
                step_name="Commercial API Tools Execution",
                action_type="tool_call",
                details={
                    "endpoints_called": ["spare_parts", "orders", "purchase_details", "quotations"],
                    "responses": {
                        "parts_catalog": parts_data,
                        "order_history": orders_data,
                        "purchase_details": purchase_data,
                        "quotation_history": quote_data
                    }
                }
            )

        # 3. Inject context into the prompt
        variables = {
            "user_query": query,
            "parts_catalog": parts_data,
            "order_history": orders_data,
            "purchase_details": purchase_data,
            "quotation_history": quote_data
        }
        prompt = prompt_registry.render("commercial", variables)
        
        messages = [
            {"role": "system", "content": prompt.system_message}
        ]
        if "messages" in context:
            messages.extend(context["messages"])
        messages.append({"role": "user", "content": prompt.user_message})
        
        # 4. Structured Output for HITL Routing
        decision: CommercialDecision = await self.llm.generate_structured(
            model_name=self.worker_model, 
            messages=messages, 
            response_schema=CommercialDecision,
            temperature=prompt.model_defaults.temperature or 0.1
        )

        if tracer and decision:
            tracer.add_llm_step("Commercial HITL Decision", self.worker_model, messages, decision.model_dump_json(), decision.model_dump())

        # 5. Route to HITL or Stream standard response
        if decision and decision.needs_quote:
            tool_dict = ToolRegistry.create_commercial_request(
                title=f"Spare Part Order: {decision.part_name}",
                request_type="spare_parts",
                urgency="medium"
            )
            if tracer:
                tracer.add_step("HITL Tool Triggered", "tool_call", tool_dict)
            return tool_dict, messages
            
        return self.llm.stream_response(model_name=self.worker_model, messages=messages), messages

class GeneralAgent(BaseAgent):
    async def draft_response(self, query: str, context: Dict[str, Any], tracer: Any = None) -> Tuple[Union[AsyncGenerator[str, None], Dict[str, Any]], List[Dict[str, Any]]]:
        messages = [{"role": "system", "content": "You are a helpful AROL support assistant."}, {"role": "user", "content": query}]
        return self.llm.stream_response(model_name=self.worker_model, messages=messages, temperature=0.4), messages