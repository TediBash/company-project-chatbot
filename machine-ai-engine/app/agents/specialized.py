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
    get_order_history,
    get_purchase_details,
    get_quotation_history,
    query_filtered_quotes,
    query_filtered_orders,
    get_machine_financials,
    get_machine_quotations,
    get_machine_order_lines
)


class DataExtractionPlan(BaseModel):
    """The agent uses this to decide which API calls to execute."""
    fetch_quotes: bool = Field(description="True if asking about quotes, proposals, or pricing histories.")
    fetch_orders: bool = Field(description="True if asking about orders, fulfillment, or purchases made.")
    fetch_financials: bool = Field(description="True if asking about original machine cost or delivery dates.")
    filter_by_company: bool = Field(description="True if the user is asking about the current company's data.")
    filter_by_machine: bool = Field(description="True if the user is asking about a specific machine asset.")
    requires_approved_quotes: bool = Field(description="True if explicitly asking for 'approved' quotes.")
    requires_quotes_with_orders: bool = Field(description="True if asking for quotes that have an associated order.")

class QuoteLineItem(BaseModel):
    machine_id: str = Field(description="The exact UUID of the target machine.")
    item_description: str = Field(description="What is being sold/serviced.")
    price: float = Field(description="The price for this line item.")

class CommercialDecision(BaseModel):
    """The agent uses this to trigger Human-in-the-Loop workflows."""
    action_intent: str = Field(
        default="read",
        description="Must be 'read', 'create_ticket', or 'create_quote'."
    )
    is_ready_to_execute: bool = Field(
        default=False,
        description="CRITICAL: Set to True ONLY if all required details are provided by the user. If False, the agent will reply and ask for missing details."
    )
    
    # Fields for 'create_ticket'
    part_name: str = Field(default="None", description="The specific part to buy or quote.")
    request_type: str = Field(default="Spare Parts", description="e.g., 'Spare Parts', 'Maintenance Service'.")
    urgency: str = Field(default="Standard", description="Must be 'Low', 'Standard', 'Urgent', or 'Critical'.")
    ticket_description: str = Field(default="", description="A summary for the ticket.")
    
    # Fields for 'create_quote'
    quote_description: str = Field(default="", description="Overall description of the quote.")
    quote_currency: str = Field(default="EUR", description="Currency for the quote, default EUR.")
    quote_lines: List[QuoteLineItem] = Field(default_factory=list, description="List of items to include in the quote.")
    
    reasoning: str = Field(description="Briefly explain your classification and readiness.")

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
            tasks.append(asyncio.sleep(0))
            
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
        decision_system_prompt = """
        You are a strict routing classifier. Your ONLY job is to determine if the user is asking to read data ('read'), create a commercial request ticket ('create_ticket'), or draft a new quote ('create_quote').

        If 'create_ticket', you need part_name and urgency.
        If 'create_quote', you need quote_description, currency, and a list of quote_lines (machine_id, item_description, price). DO NOT guess prices.
        
        CRITICAL: If the user wants to create a quote or ticket but hasn't provided ALL the required information, set 'is_ready_to_execute' to false!
        
        FEW-SHOT EXAMPLES:
        User: "I want to create a quote for a new spindle."
        Output: {"action_intent": "create_quote", "is_ready_to_execute": false, "reasoning": "User wants a quote but hasn't provided the price or machine ID."}
        
        User: "Create a quote for a new spindle. Price is 1500 EUR for machine abc-123."
        Output: {"action_intent": "create_quote", "is_ready_to_execute": true, "quote_description": "New spindle", "quote_currency": "EUR", "quote_lines": [{"machine_id": "abc-123", "item_description": "New spindle", "price": 1500}], "reasoning": "All info provided."}
        """
        
        decision_messages = [
            {"role": "system", "content": decision_system_prompt}
        ]
        if "messages" in context:
            decision_messages.extend(context["messages"])
        decision_messages.append({"role": "user", "content": query})
        
        decision: CommercialDecision = await self.llm.generate_structured(
            model_name=self.worker_model, 
            messages=decision_messages, 
            response_schema=CommercialDecision,
            temperature=prompt.model_defaults.temperature or 0.0
        )

        if tracer and decision:
            tracer.add_llm_step("Commercial HITL Decision", self.worker_model, decision_messages, decision.model_dump_json(), decision.model_dump())

        # 5. Route to HITL Tool OR Stream conversational response
        if decision and decision.is_ready_to_execute:
            
            # TRIGGER 1: Standard Spare Part Ticket
            if decision.action_intent == "create_ticket":
                tool_dict = ToolRegistry.create_commercial_request(
                    title=f"Commercial Request: {decision.part_name}",
                    request_type=decision.request_type,
                    urgency=decision.urgency,
                    description=decision.ticket_description,
                    machine_id=active_machine_id,
                    company_id=company_id
                )
                if tracer:
                    tracer.add_step("HITL Tool Triggered (Ticket)", "tool_call", tool_dict)
                return tool_dict, messages
                
            # TRIGGER 2: Quote Builder Engine
            elif decision.action_intent == "create_quote":
                
                # Sanitize lines to ensure valid UUIDs instead of LLM hallucinations
                sanitized_lines = []
                for line in decision.quote_lines:
                    m_id = line.machine_id
                    # If the AI wrote "this machine" or it's clearly not a UUID, force the active ID
                    if m_id.lower() in ["this machine", "unknown", "none", "", "active"] or len(m_id) < 10:
                        m_id = active_machine_id
                        
                    sanitized_lines.append({
                        "machine_id": m_id,
                        "item_description": line.item_description,
                        "price": line.price
                    })

                tool_dict = {
                    "is_tool_call": True,
                    "payload": {
                        "action": "create_quote",
                        "title": f"Draft New Quote: {decision.quote_description}",
                        "data": {
                            "companyId": company_id,
                            "description": decision.quote_description,
                            "currency": decision.quote_currency,
                            "lines": sanitized_lines
                        }
                    }
                }
                if tracer:
                    tracer.add_step("HITL Tool Triggered (Quote)", "tool_call", tool_dict)
                return tool_dict, messages

        # Fallback: Talk to the user (e.g., to read data, or to ask for missing quote details)
        return self.llm.stream_response(model_name=self.worker_model, messages=messages), messages

class GeneralAgent(BaseAgent):
    async def draft_response(self, query: str, context: Dict[str, Any], tracer: Any = None) -> Tuple[Union[AsyncGenerator[str, None], Dict[str, Any]], List[Dict[str, Any]]]:
        messages = [{"role": "system", "content": "You are a helpful AROL support assistant."}, {"role": "user", "content": query}]
        return self.llm.stream_response(model_name=self.worker_model, messages=messages, temperature=0.4), messages