# app/pipeline/executor.py
import asyncio
from typing import AsyncGenerator, Dict, Any
from pydantic import BaseModel, Field

from app.pipeline.config import active_pipeline
from app.pipeline.memory import MemoryPipelineManager
from app.rag.provider import RAGPipelineProvider
from app.agents.router import IntentRouter
from app.agents.specialized import TechnicalAgent, CommercialAgent, OperationalAgent, GeneralAgent
from app.llm.client import UniversalLLMClient
from app.prompts.registry import prompt_registry

class CriticEvaluation(BaseModel):
    is_valid: bool = Field(description="True if the draft safely and accurately answers the user.")
    feedback: str = Field(description="Reasoning or instructions for the agent if rejected. Empty if valid.")

class CognitiveLoopExecutor:
    def __init__(self, session_id: str, company_id: str, user_id: str):
        self.session_id = session_id
        self.company_id = company_id
        self.user_id = user_id
        
        self.memory_manager = MemoryPipelineManager()
        self.rag_provider = RAGPipelineProvider()
        self.router = IntentRouter()
        self.llm = UniversalLLMClient()
        
        self.agents = {
            "technical": TechnicalAgent(),
            "commercial": CommercialAgent(),
            "operational": OperationalAgent(),
            "general": GeneralAgent()
        }
        
        self.iteration_count = 0

    async def execute(self, user_query: str) -> AsyncGenerator[Dict[str, Any], None]:
        try:
            # 1. Guardrails
            if active_pipeline.control.guardrails_enabled:
                yield {"type": "status", "payload": "Running security guardrails..."}
                
            # 2. Intent Routing
            target_agent_name = "general"
            if active_pipeline.control.use_intent_router:
                yield {"type": "status", "payload": "Classifying query intent..."}
                target_agent_name = await self.router.route(user_query)
                yield {"type": "status", "payload": f"Routed to {target_agent_name.capitalize()} Agent."}
            
            selected_agent = self.agents[target_agent_name]

            # 3. Context Assembly
            yield {"type": "status", "payload": "Assembling memory context..."}
            
            # FIX: Base prompt is now handled by Jinja2 templates, so we pass an empty string here.
            context = await self.memory_manager.assemble_context(
                self.session_id, self.company_id, base_system_prompt=""
            )
            
            if active_pipeline.rag.enabled and target_agent_name == "technical":
                rag_docs = self.rag_provider.retrieve_context(user_query)
                if rag_docs:
                    context["rag_blocks"] = self.rag_provider.format_system_prompt_block(rag_docs)

            # 4. The Cognitive Loop (Self-Correcting)
            final_draft_text = ""
            
            while self.iteration_count < active_pipeline.budget.max_iterations_per_answer:
                self.iteration_count += 1
                yield {"type": "status", "payload": f"Drafting response (Attempt {self.iteration_count})..."}
                
                response_obj = await selected_agent.draft_response(user_query, context)
                
                # A. Handle Tool Calls (HITL) immediately
                if isinstance(response_obj, dict) and response_obj.get("is_tool_call"):
                    yield {"type": "status", "payload": "Action requires human approval..."}
                    yield {"type": "action_required", "payload": response_obj["payload"]}
                    return 
                
                # B. Buffer the text stream to evaluate it
                draft_text = ""
                async for chunk in response_obj:
                    draft_text += chunk
                    
                # C. Bypass Critic if disabled
                if not active_pipeline.control.validate_response_enabled:
                    final_draft_text = draft_text
                    break

                # D. Ask the Critic Agent
                yield {"type": "status", "payload": "Critic Agent validating response..."}
                
                critic_vars = {"user_query": user_query, "agent_draft": draft_text}
                critic_prompt = prompt_registry.render("critic", critic_vars)
                critic_msgs = [
                    {"role": "system", "content": critic_prompt.system_message},
                    {"role": "user", "content": critic_prompt.user_message}
                ]
                
                evaluation: CriticEvaluation = await self.llm.generate_structured(
                    model_name=active_pipeline.llm_routing.critic_model,
                    messages=critic_msgs,
                    response_schema=CriticEvaluation,
                    temperature=critic_prompt.model_defaults.temperature or 0.0
                )
                
                if evaluation and evaluation.is_valid:
                    yield {"type": "status", "payload": "Response validated successfully."}
                    final_draft_text = draft_text
                    break
                else:
                    feedback_msg = evaluation.feedback if evaluation else "Unknown validation failure."
                    yield {"type": "status", "payload": f"Critic rejected: {feedback_msg}"}
                    
                    # INJECT THE FEEDBACK SO THE AGENT LEARNS ON THE NEXT ITERATION!
                    if "messages" not in context:
                        context["messages"] = []
                    context["messages"].append({"role": "assistant", "content": draft_text})
                    context["messages"].append({
                        "role": "user", 
                        "content": f"SYSTEM FEEDBACK: Your draft was rejected. Reason: {feedback_msg}. Rewrite your response to fix this."
                    })
                    
            if not final_draft_text:
                final_draft_text = "I am unable to generate a response that passes safety validations. Please consult a human technician."

            # 5. Stream Final Approved Text to UI
            yield {"type": "status", "payload": "Transmitting..."}
            
            # Simulate streaming the buffered text to keep the UI animation smooth
            words = final_draft_text.split(" ")
            for word in words:
                yield {"type": "message", "payload": word + " "}
                await asyncio.sleep(0.02)

        except Exception as e:
            print(f"[Executor Error] {e}")
            yield {"type": "error", "payload": "The AI Engine encountered a fatal error."}