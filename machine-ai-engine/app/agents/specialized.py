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
    get_quotation_history,
    query_filtered_quotes,
    query_filtered_orders,
    get_machine_financials,
    get_machine_quotations,
    get_machine_order_lines
)

from app.tools.commercial import get_spare_parts_catalog, get_order_history

class DataExtractionPlan(BaseModel):
    """The agent uses this to decide which API calls to execute."""
    fetch_quotes: bool = Field(description="True if asking about quotes, proposals, or pricing histories.")
    fetch_orders: bool = Field(description="True if asking about orders, fulfillment, or purchases made.")
    fetch_financials: bool = Field(description="True if asking about original machine cost or delivery dates.")
    filter_by_company: bool = Field(description="True if the user is asking about the current company's data.")
    filter_by_machine: bool = Field(description="True if the user is asking about a specific machine asset.")
    requires_approved_quotes: bool = Field(description="True if explicitly asking for 'approved' quotes.")
    requires_quotes_with_orders: bool = Field(description="True if asking for quotes that have an associated order.")

class CommercialDecision(BaseModel):
    """The agent uses this to trigger Human-in-the-Loop workflows."""
    needs_quote: bool = Field(
        description="CRITICAL: Set to True ONLY if the user explicitly uses action words like 'buy', 'purchase', 'order a new', or 'create quote'. Set to False if they are just reading data."
    )
    part_name: str = Field(
        default="None", 
        description="The specific part to buy or quote. Set to 'None' if needs_quote is False."
    )
    request_type: str = Field(
        default="Spare Parts",
        description="Must be one of: 'Spare Parts', 'Machine Upgrade', 'Maintenance Service', 'Consumables', or 'Other'."
    )
    urgency: str = Field(
        default="Standard",
        description="Must be one of: 'Low', 'Standard', 'Urgent', or 'Critical' based on the user's sentiment."
    )
    description: str = Field(
        default="",
        description="A concise summary of the requested items or services for the ticket description."
    )
    reasoning: str = Field(
        description="Briefly explain if the user is asking to CREATE a transaction or just READ history."
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "needs_quote": False,
                    "part_name": "None",
                    "request_type": "Spare Parts",
                    "urgency": "Standard",
                    "description": "",
                    "reasoning": "The user is asking how many orders exist, which is a read-only historical data request."
                },
                {
                    "needs_quote": True,
                    "part_name": "Pneumatic Valve Assembly",
                    "request_type": "Spare Parts",
                    "urgency": "Urgent",
                    "description": "User requested an urgent replacement for the pneumatic valve assembly.",
                    "reasoning": "The user explicitly stated 'I want to buy a new pneumatic valve' and indicated urgency."
                }
            ]
        }
    }

class BaseAgent:
    def __init__(self):
        self.llm = UniversalLLMClient()
        self.worker_model = active_pipeline.llm_routing.worker_model

    async def draft_response(self, query: str, context: Dict[str, Any], tracer: Any = None) -> Tuple[Union[AsyncGenerator[str, None], Dict[str, Any]], List[Dict[str, Any]]]:
        raise NotImplementedError

class TechnicalAgent(BaseAgent):
    async def draft_response(self, query: str, context: Dict[str, Any], tracer: Any = None) -> Tuple[Union[AsyncGenerator[str, None], Dict[str, Any]], List[Dict[str, Any]]]:
        # 1. Extract session credentials for API calls
        machine_id = context.get("active_machine_id", "unknown")
        auth_token = context.get("auth_token", "")
        
        # 2. CROSS-DOMAIN REASONING: Fetch Telemetry 
        # The agent uses this data alongside the RAG manual to predict maintenance
        telemetry_data = await query_telemetry(machine_id, auth_token)
        
        if tracer:
            tracer.add_step(
                step_name="Technical Agent Telemetry Fetch",
                action_type="tool_call",
                details={"target_machine": machine_id, "telemetry_response": telemetry_data}
            )

        # 3. Inject variables into the prompt registry
        variables = {
            "user_query": query,
            "rag_context": context.get("rag_blocks", ""),
            "roadmap_state": context.get("system_prompt", ""),
            "telemetry_data": telemetry_data
        }
        prompt = prompt_registry.render("technical", variables)
        
        # 4. Assemble Messages (The YAML natively handles the few-shot rules)
        messages = [{"role": "system", "content": prompt.system_message}]
        if "messages" in context:
            messages.extend(context["messages"])
        messages.append({"role": "user", "content": prompt.user_message})

        # 5. Stream the Response
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
        
        # Prepare base messages
        messages = [{"role": "system", "content": "Analyze the user's intent to extract data filtering requirements."}]
        if "messages" in context:
            messages.extend(context["messages"])
        messages.append({"role": "user", "content": query})

        # ==========================================
        # STEP 1: PARSE INTENT & EXTRACT FILTERS
        # ==========================================
        plan: DataExtractionPlan = await self.llm.generate_structured(
            model_name=self.worker_model, 
            messages=messages, 
            response_schema=DataExtractionPlan,
            temperature=0.0
        )

        if tracer:
            tracer.add_llm_step("Commercial Data Plan", self.worker_model, messages, plan.model_dump_json(), plan.model_dump())
        
        tasks = [
            get_machine_quotations(active_machine_id, auth_token),
            get_machine_order_lines(active_machine_id, auth_token)
            ]
        
        # Map boolean flags to actual context IDs
        c_id = company_id if plan.filter_by_company else None
        m_id = active_machine_id if plan.filter_by_machine else None
        q_status = "Approved" if plan.requires_approved_quotes else None

        if plan.fetch_quotes:
            tasks.append(query_filtered_quotes(auth_token, c_id, m_id, plan.requires_quotes_with_orders, q_status))
        else:
            tasks.append(asyncio.sleep(0)) # No-op placeholder
            
        if plan.fetch_orders:
            tasks.append(query_filtered_orders(auth_token, c_id, m_id))
        else:
            tasks.append(asyncio.sleep(0))
            
        if plan.fetch_financials:
            tasks.append(get_machine_financials(active_machine_id, auth_token))
        else:
            tasks.append(asyncio.sleep(0))

        # Execute Concurrently
        results = await asyncio.gather(*tasks)
        machine_quotes_data, machine_orders_data, quotes_data, orders_data, financials_data = results

        if tracer:
            tracer.add_step("Executed Dynamic Data Fetch", "tool_call", {"plan": plan.model_dump(), "fetched_quotes": bool(plan.fetch_quotes), "fetched_orders": bool(plan.fetch_orders)})
        
        if tracer:
            tracer.add_step(
                step_name="Commercial API Tools Execution",
                action_type="tool_call",
                details={
                    "endpoints_called": ["spare_parts", "orders", "purchase_details", "quotations"],
                    "responses": {
                        "machine_quotes_data": machine_quotes_data,
                        "machine_orders_data": machine_orders_data,
                        "order_history": orders_data or '',
                        "quote_data": quotes_data,
                        "financials_data": financials_data
                    }
                }
            )

        # 3. Inject context into the prompt
        variables = {
            "user_query": query,
            "machine_quotation_lines": machine_quotes_data,
            "machine_order_lines": machine_orders_data,
            "quotation_history": quotes_data if plan.fetch_quotes else "Data not requested for this query.",
            "order_history": orders_data if plan.fetch_orders else "Data not requested for this query.",
            "purchase_details": financials_data if plan.fetch_financials else "Data not requested for this query."
        }
        prompt = prompt_registry.render("commercial", variables)
        
        messages = [
            {"role": "system", "content": prompt.system_message}
        ]
        if "messages" in context:
            messages.extend(context["messages"])
        messages.append({"role": "user", "content": prompt.user_message})
        
        
        # 4. Structured Output for HITL Routing
        # --- ISOLATED HITL DECISION CALL ---
        decision_system_prompt = """
        You are a strict routing classifier. Your ONLY job is to determine if the user is asking to initiate a NEW transaction (buy a part, request a quote) OR if they are just asking to read historical data.
        If initiating a transaction, extract the request type, urgency, and formulate a description.
        
        FEW-SHOT EXAMPLES:
        User: "How many orders has this company made for this machine?"
        Output: {"needs_quote": false, "part_name": "None", "request_type": "Spare Parts", "urgency": "Standard", "description": "", "reasoning": "User is asking for historical order count."}
        
        User: "Show me the approved quotes."
        Output: {"needs_quote": false, "part_name": "None", "request_type": "Spare Parts", "urgency": "Standard", "description": "", "reasoning": "User is asking to view existing approved quotes."}
        
        User: "I need to order a replacement magnetic clutch ASAP, the line is stopped!"
        Output: {"needs_quote": true, "part_name": "magnetic clutch", "request_type": "Spare Parts", "urgency": "Critical", "description": "Customer needs a replacement magnetic clutch immediately due to a line stoppage.", "reasoning": "User explicitly asked to order a new part and indicated a critical machine-down situation."}
        """
        
        decision_messages = [
            {"role": "system", "content": decision_system_prompt},
            {"role": "user", "content": query}
        ]
        
        decision: CommercialDecision = await self.llm.generate_structured(
            model_name=self.worker_model, 
            messages=decision_messages, 
            response_schema=CommercialDecision,
            temperature=prompt.model_defaults.temperature or 0.0
        )

        if tracer and decision:
            tracer.add_llm_step("Commercial HITL Decision", self.worker_model, messages, decision.model_dump_json(), decision.model_dump())

        # 5. Route to HITL or Stream standard response
        if decision and decision.needs_quote:
            tool_dict = ToolRegistry.create_commercial_request(
                title=f"Commercial Request: {decision.part_name}",
                request_type=decision.request_type,
                urgency=decision.urgency,
                description=decision.description,
                machine_id=active_machine_id,
                company_id=company_id
            )
            if tracer:
                tracer.add_step("HITL Tool Triggered", "tool_call", tool_dict)
            return tool_dict, messages
            
        return self.llm.stream_response(model_name=self.worker_model, messages=messages), messages

class GeneralAgent(BaseAgent):
    async def draft_response(self, query: str, context: Dict[str, Any], tracer: Any = None) -> Tuple[Union[AsyncGenerator[str, None], Dict[str, Any]], List[Dict[str, Any]]]:
        messages = [{"role": "system", "content": "You are a helpful AROL support assistant."}, {"role": "user", "content": query}]
        return self.llm.stream_response(model_name=self.worker_model, messages=messages, temperature=0.4), messages