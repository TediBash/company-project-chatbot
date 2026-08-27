# app/agents/router.py
from typing import Literal, Any
from pydantic import BaseModel, Field
from app.llm.client import UniversalLLMClient
from app.pipeline.config import active_pipeline
from app.prompts.registry import prompt_registry

class IntentClassification(BaseModel):
    intent: Literal["technical", "commercial", "operational", "general", "out_of_scope_machine"] = Field(
        description="The classified intent of the user's message."
    )
    reasoning: str = Field(
        description="A brief, 1-sentence explanation of why this intent was chosen."
    )

class IntentRouter:
    def __init__(self):
        self.llm = UniversalLLMClient()
        self.model = active_pipeline.llm_routing.router_model

    async def route(
        self, 
        query: str, 
        user_role: str,
        active_machine_name: str,
        active_serial_number: str,
        system_date: str,
        last_agent_message: str = "",
        tracer: Any = None
    ) -> Literal["technical", "commercial", "operational", "general", "out_of_scope_machine"]:
        
        variables = {
            "user_query": query,
            "user_role": user_role,
            "active_machine_name": active_machine_name,
            "active_serial_number": active_serial_number,
            "system_date": system_date,
            "last_agent_message": last_agent_message
        }
        prompt = prompt_registry.render(name="router", variables=variables)

        messages = [
            {"role": "system", "content": prompt.system_message},
            {"role": "user", "content": prompt.user_message}
        ]

        print(f"[Router] Analyzing intent using {self.model}...")
        
        result: IntentClassification = await self.llm.generate_structured(
            model_name=self.model,
            messages=messages,
            response_schema=IntentClassification,
            temperature=prompt.model_defaults.temperature or 0.0
        )

        # Trace the LLM's exact classification logic
        if tracer and result:
            tracer.add_llm_step(
                step_name="Intent Classification",
                model_name=self.model,
                messages=messages,
                response=result.model_dump_json(),
                structured_output=result.model_dump()
            )

        if result:
            print(f"[Router] Classified as: {result.intent.upper()} (Reason: {result.reasoning})")
            return result.intent
            
        return "general"