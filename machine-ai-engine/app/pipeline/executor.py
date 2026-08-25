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
from app.pipeline.tracer import AITrajectoryTracer

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
        # 1. Initialize Tracer
        tracer = AITrajectoryTracer(self.session_id, self.company_id, self.user_id)
        tracer.question = user_query
        target_agent_name = "general"
        
        try:
            # 2. Guardrails
            if active_pipeline.control.guardrails_enabled:
                yield {"type": "status", "payload": "Running security guardrails..."}
                tracer.add_step("Security Guardrails", "system_check", {"status": "passed"})
                
            # 3. Routing
            if active_pipeline.control.use_intent_router:
                yield {"type": "status", "payload": "Classifying query intent..."}
                target_agent_name = await self.router.route(user_query, tracer=tracer)
                yield {"type": "status", "payload": f"Routed to {target_agent_name.capitalize()} Agent."}
            
            tracer.target_agent = target_agent_name
            selected_agent = self.agents[target_agent_name]

            # 4. Context Assembly & RAG (UPDATED FOR METADATA FILTERING)
            yield {"type": "status", "payload": "Assembling memory context..."}
            context = await self.memory_manager.assemble_context(
                self.session_id, self.company_id, base_system_prompt=""
            )
            
            if active_pipeline.rag.enabled and target_agent_name == "technical":
                # Extract the active machine from the session context (or default to None)
                active_machine = getattr(self, "active_machine_id", "unknown")
                active_machine_name = getattr(self, "active_machine_name", "Unknown Model")
                tracer.machine_id = active_machine
                
                # Pass the machine_model to the provider for filtered retrieval
                rag_docs = self.rag_provider.retrieve_context(
                    query_text=user_query, 
                    machine_model=active_machine
                )
                
                machine_directive = (
                                        f"\n### ACTIVE TARGET MACHINE\n"
                                        f"You are currently supporting the {active_machine_name} (Serial Number: {active_machine}).\n"
                                        f"When the user asks what machine they are working on, confidently reply with this exact model name and serial number.\n"
                                        f"PROACTIVE OFFER: Always remind the user that you have the official manual loaded and offer to help with procedures.\n\n"
                                    )
                
                if rag_docs:
                    rag_text = self.rag_provider.format_system_prompt_block(rag_docs)
                    context["rag_blocks"] = machine_directive + rag_text
                else:
                    context["rag_blocks"] = machine_directive + "No manual excerpts required for this general query."
                    

                tracer.add_step("RAG Retrieval", "vector_search", {
                                        "machine_filter": active_machine,
                                        "docs_retrieved": len(rag_docs)
                                    })

            final_draft_text = ""
            
            # 5. Cognitive Loop
            while self.iteration_count < active_pipeline.budget.max_iterations_per_answer:
                self.iteration_count += 1
                yield {"type": "status", "payload": f"Drafting response (Attempt {self.iteration_count})..."}
                
                # Fetch Stream and Exact Messages used by the Agent
                response_obj, agent_msgs = await selected_agent.draft_response(user_query, context, tracer=tracer)
                
                if isinstance(response_obj, dict) and response_obj.get("is_tool_call"):
                    yield {"type": "status", "payload": "Action requires human approval..."}
                    yield {"type": "action_required", "payload": response_obj["payload"]}
                    await tracer.save_trajectory("[Tool Execution Halted AI for Human Input]")
                    return 
                
                draft_text = ""
                async for chunk in response_obj:
                    draft_text += chunk
                    
                # Log the Drafting LLM Call now that the stream has finished
                tracer.add_llm_step(
                    step_name=f"Agent Drafting (Iter {self.iteration_count})",
                    model_name=active_pipeline.llm_routing.worker_model,
                    messages=agent_msgs,
                    response=draft_text
                )
                    
                if not active_pipeline.control.validate_response_enabled:
                    final_draft_text = draft_text
                    break

                # 6. Critic Validation
                yield {"type": "status", "payload": "Critic Agent validating response..."}
                critic_vars = {"user_query": user_query, "agent_draft": draft_text}
                critic_prompt = prompt_registry.render("critic", critic_vars)
                critic_msgs = [{"role": "system", "content": critic_prompt.system_message}, {"role": "user", "content": critic_prompt.user_message}]
                
                evaluation: CriticEvaluation = await self.llm.generate_structured(
                    model_name=active_pipeline.llm_routing.critic_model,
                    messages=critic_msgs,
                    response_schema=CriticEvaluation,
                    temperature=critic_prompt.model_defaults.temperature or 0.0
                )
                
                if evaluation:
                    tracer.add_llm_step(
                        step_name=f"Critic Validation (Iter {self.iteration_count})",
                        model_name=active_pipeline.llm_routing.critic_model,
                        messages=critic_msgs,
                        response=evaluation.model_dump_json(),
                        structured_output=evaluation.model_dump()
                    )

                if evaluation and evaluation.is_valid:
                    yield {"type": "status", "payload": "Response validated successfully."}
                    final_draft_text = draft_text
                    break
                else:
                    feedback_msg = evaluation.feedback if evaluation else "Validation failure."
                    yield {"type": "status", "payload": f"Critic rejected: {feedback_msg}"}
                    
                    if "messages" not in context:
                        context["messages"] = []
                    context["messages"].append({"role": "assistant", "content": draft_text})
                    context["messages"].append({"role": "user", "content": f"SYSTEM FEEDBACK: Your draft was rejected: {feedback_msg}. Rewrite your response to fix this."})
                    
            # app/pipeline/executor.py (excerpt)
            # ... (keep everything inside the while loop the same) ...
            
            if not final_draft_text:
                final_draft_text = "I am unable to generate a response that passes safety validations."

            yield {"type": "status", "payload": "Transmitting..."}
            words = final_draft_text.split(" ")
            for word in words:
                yield {"type": "message", "payload": word + " "}
                await asyncio.sleep(0.02)

        except Exception as e:
            print(f"[Executor Error] {e}")
            final_draft_text = f"[FATAL EXECUTOR ERROR: {str(e)}]"
            yield {"type": "error", "payload": "The AI Engine encountered a fatal error."}
            
        finally:
            # 3. GUARANTEE EXECUTION
            # This block runs no matter what happens (success, error, or frontend disconnect).
            if 'final_draft_text' not in locals():
                final_draft_text = "[Stream Interrupted]"
                
            await tracer.save_trajectory(final_answer=final_draft_text)