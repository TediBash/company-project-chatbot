# app/pipeline/executor.py
import asyncio
from multiprocessing import context
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
from app.tools.operational import get_machine_configuration


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
                
                # Fetch variables for the router
                user_role = getattr(self, "user_role", "technician")
                active_machine_name = getattr(self, "active_machine_name", "Unknown Model")
                active_machine_id  = getattr(self, "active_machine_id", "");
                
                # FIX: Extract strictly the serial number, avoiding machine_id fallback
                raw_serial = getattr(self, "active_serial_number", "")
                active_serial = raw_serial if raw_serial and raw_serial != getattr(self, "active_machine_id", "") else "Unknown SN"
                
                last_agent_msg = ""
                try:
                    # Retrieve history (adapt this to your exact memory_manager method)
                    history = await self.memory_manager.get_chat_history(self.session_id, self.company_id)
                    # Find the last message where role == 'assistant'
                    for msg in reversed(history):
                        if msg.get("role") == "assistant":
                            last_agent_msg = msg.get("content", "")
                            break
                except Exception as e:
                    print(f"Could not fetch history for router: {e}")
                
                target_agent_name = await self.router.route(
                    query=user_query,
                    user_role=user_role,
                    active_machine_name=active_machine_name,
                    active_serial_number=active_serial,
                    system_date="2026-08-05",
                    last_agent_message=last_agent_msg,
                    tracer=tracer
                )
                yield {"type": "status", "payload": f"Routed to {target_agent_name.capitalize()} Agent."}
            
            # =================================================================
            # PHASE 1 GUARDRAILS (RBAC & Machine Lock)
            # =================================================================
            user_role = getattr(self, "user_role", "technician")
            
            # Guardrail A: Block Technicians from Commercial Data
            if user_role == "technician" and target_agent_name == "commercial":
                rejection_msg = "Your role as a technician does not permit access to Quotes, Orders, or Commercial data. Please contact an administrator."
                yield {"type": "message", "payload": rejection_msg}
                final_draft_text = rejection_msg
                return  
                
            # Guardrail B: Block Commercial from Operational Data 
            if user_role == "commercial" and target_agent_name == "operational":
                rejection_msg = "Your role as a commercial user does not permit access to Telemetry, Alarms, or Maintenance data."
                yield {"type": "message", "payload": rejection_msg}
                final_draft_text = rejection_msg
                return 

            # Guardrail C: Strict Machine Lock Interception
            if target_agent_name == "out_of_scope_machine":
                active_name = getattr(self, "active_machine_name", "this machine")
                active_sn = getattr(self, "active_serial_number", "")
                active_sn = active_sn if active_sn and active_sn != getattr(self, "active_machine_id", "") else "Unknown SN"
                
                rejection_msg = f"You are only allowed to ask questions regarding the active machine: {active_name} (SN: {active_sn}). If you want to discuss another machine, please create a new chat."
                yield {"type": "message", "payload": rejection_msg}
                final_draft_text = rejection_msg
                return
            # =================================================================

            tracer.target_agent = target_agent_name
            selected_agent = self.agents[target_agent_name]

            # 4. Context Assembly & RAG
            yield {"type": "status", "payload": "Assembling memory context..."}
            
            # Extract credentials and machine specifics
            active_machine_name = getattr(self, "active_machine_name", "Unknown Model")
            active_machine_model = getattr(self, "active_machine_model", "Unknown Model")
            raw_serial = getattr(self, "active_serial_number", "")
            active_serial = raw_serial if raw_serial and raw_serial != getattr(self, "active_machine_id", "") else "Unknown SN"
            
            machine_config_data = await self.memory_manager.get_session_variable(self.session_id, "machine_config")
            if not machine_config_data and active_machine_id:
                try:
                    machine_config_data = await get_machine_configuration(active_machine_id, getattr(self, "auth_token", ""))
                    await self.memory_manager.save_session_variable(self.session_id, "machine_config", machine_config_data)
                except Exception as e:
                    print(f"Failed to fetch machine config: {e}")
                    machine_config_data = "Configuration unavailable."
            
            # ---> MOVED: Machine Directive is now globally available to all agents <---
            machine_directive = (
                f"\n### ACTIVE TARGET MACHINE\n"
                f"You are currently supporting the {active_machine_name}.\n"
                f"- Model Code: {active_machine_model}\n"
                f"- Serial Number: {active_serial}\n"
                f"### EXTENDED CONFIGURATION PROFILE\n"
                f"The physical specifications and installed options for this specific machine are:\n"
                f"{machine_config_data}\n\n"
                f"When the user asks what machine they are working on or asks for its specifications, confidently reply with this exact data.\n"
                f"PROACTIVE OFFER: Always remind the user that you have the official manual loaded and offer to help with procedures.\n\n"
            )
            
            # Inject the machine directive directly into the base system prompt
            context = await self.memory_manager.assemble_context(
                session_id=self.session_id, 
                company_id=self.company_id, 
                base_system_prompt=machine_directive,
                user_query=user_query
            )
            
            system_date = "2026-08-05" 
            context["system_date"] = system_date
            context["auth_token"] = getattr(self, "auth_token", "")
            context["active_machine_id"] = getattr(self, "active_machine_id", "")
            context["company_id"] = self.company_id
            
            if active_pipeline.rag.enabled and target_agent_name == "technical":
                active_machine = getattr(self, "active_machine_id", "unknown")
                tracer.machine_id = active_machine
                
                short_query = len(user_query.split()) <= 4
                is_continuation = short_query and any(word in user_query.lower() for word in ["next", "continue", "done", "yes", "ready", "step"])
                
                rag_docs = []
                
                if not is_continuation:
                    rag_docs = self.rag_provider.retrieve_context(
                        query_text=user_query, 
                        serial_number=active_serial
                    )
                
                if rag_docs:
                    new_rag_block = self.rag_provider.format_system_prompt_block(rag_docs)
                    context["rag_blocks"] = new_rag_block
                    
                    await self.memory_manager.save_session_variable(self.session_id, "pinned_rag_context", new_rag_block)
                else:
                    # No new context (e.g., user just said "next"): Try to load the pinned context
                    pinned_rag = await self.memory_manager.get_session_variable(self.session_id, "pinned_rag_context")
                    
                    if pinned_rag:
                        context["rag_blocks"] = pinned_rag
                    else:
                        context["rag_blocks"] = "SYSTEM ALERT: No relevant manual excerpts were found in the database for this specific machine. You MUST state that you do not have the manual available and CANNOT provide mechanical steps."                
                    
                tracer.add_step("RAG Retrieval", "vector_search", {
                    "serial_number": active_serial,
                    "docs_retrieved": len(rag_docs),
                    "used_pinned_context": bool(not rag_docs and pinned_rag)
                })


            final_draft_text = ""
            last_draft = ""  # Tracks the best available draft in case of QA failure
            
            # 5. Cognitive Loop
            while self.iteration_count < active_pipeline.budget.max_iterations_per_answer:
                self.iteration_count += 1
                yield {"type": "status", "payload": f"Drafting response (Attempt {self.iteration_count})..."}
                
                response_obj, agent_msgs = await selected_agent.draft_response(user_query, context, tracer=tracer)
                
                if isinstance(response_obj, dict) and response_obj.get("is_tool_call"):
                    yield {"type": "status", "payload": "Action requires human approval..."}
                    yield {"type": "action_required", "payload": response_obj["payload"]}
                    await tracer.save_trajectory("[Tool Execution Halted AI for Human Input]")
                    return 
                
                draft_text = ""
                async for chunk in response_obj:
                    draft_text += chunk
                
                # Save the current draft so we have it if the loop fails
                last_draft = draft_text
                    
                tracer.add_llm_step(
                    step_name=f"Agent Drafting (Iter {self.iteration_count})",
                    model_name=active_pipeline.llm_routing.worker_model,
                    messages=agent_msgs,
                    response=draft_text
                )
                    
                if not active_pipeline.control.validate_response_enabled or target_agent_name == "general":
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
                    
            # =================================================================
            # 🛑 FALLBACK LOGIC (Graceful Degradation)
            # =================================================================
            if not final_draft_text:
                if self.iteration_count >= active_pipeline.budget.max_iterations_per_answer and last_draft:
                    fallback_warning = (
                        "⚠️ **System Notice: This response could not be fully verified against our strict "
                        "citation and safety guidelines. It may contain incomplete references or inaccuracies. "
                        "Please proceed with caution and consult the physical manual.**\n\n"
                    )
                    final_draft_text = fallback_warning + last_draft
                else:
                    final_draft_text = "I am unable to generate a response that passes our safety and accuracy validations."

            yield {"type": "status", "payload": "Transmitting..."}
            
            chunk_size = 5
            words = final_draft_text.split(" ")
            
            for i in range(0, len(words), chunk_size):
                chunk = " ".join(words[i:i+chunk_size]) + " "
                yield {"type": "message", "payload": chunk}
                await asyncio.sleep(0.01)

        except Exception as e:
            print(f"[Executor Error] {e}")
            final_draft_text = f"[FATAL EXECUTOR ERROR: {str(e)}]"
            yield {"type": "error", "payload": "The AI Engine encountered a fatal error."}
            
        finally:
            # GUARANTEE EXECUTION
            if 'final_draft_text' not in locals() or not final_draft_text:
                final_draft_text = "[Stream Interrupted]"
                
            await tracer.save_trajectory(final_answer=final_draft_text)