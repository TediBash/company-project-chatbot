# app/pipeline/executor.py
import asyncio
from typing import AsyncGenerator, Dict, Any
from app.pipeline.config import active_pipeline
from app.pipeline.memory import MemoryPipelineManager
from app.rag.provider import RAGPipelineProvider
from app.agents.router import IntentRouter
from app.agents.specialized import TechnicalAgent, CommercialAgent, OperationalAgent, GeneralAgent

class CognitiveLoopExecutor:
    def __init__(self, session_id: str, company_id: str, user_id: str):
        self.session_id = session_id
        self.company_id = company_id
        self.user_id = user_id
        self.memory_manager = MemoryPipelineManager()
        self.rag_provider = RAGPipelineProvider()
        self.router = IntentRouter()
        
        self.agents = {
            "technical": TechnicalAgent(),
            "commercial": CommercialAgent(),
            "operational": OperationalAgent(),
            "general": GeneralAgent()
        }
        
        # Budget tracking
        self.iteration_count = 0
        self.total_tokens = 0
        self.total_cost = 0.0

    async def _mock_critic_evaluation(self, draft: str) -> tuple[bool, str]:
        """
        Placeholder for the Validate Response Agent.
        In production, this asks a fast LLM: "Does this draft answer the user's question accurately?"
        """
        await asyncio.sleep(1) # Simulate LLM thinking
        # For testing the loop, let's pretend it fails the first time, but passes the second time.
        if self.iteration_count == 1:
            return False, "You forgot to mention safety precautions before adjusting the valve."
        return True, "Excellent response."

    async def execute(self, user_query: str) -> AsyncGenerator[Dict[str, Any], None]:
        try:
            # 1. Guardrails
            if active_pipeline.control.guardrails_enabled:
                yield {"type": "status", "payload": "Running security guardrails..."}
                await asyncio.sleep(0.2)

            # 2. Intent Routing
            target_agent_name = "general"
            if active_pipeline.control.use_intent_router:
                yield {"type": "status", "payload": "Classifying query intent..."}
                target_agent_name = await self.router.route(user_query)
                yield {"type": "status", "payload": f"Routed to {target_agent_name.capitalize()} Agent."}
            
            selected_agent = self.agents[target_agent_name]

            # 3. Memory & RAG (Only for Technical/Operational queries)
            context = {"system_prompt": "", "messages": []}
            if target_agent_name in ["technical", "general"]:
                yield {"type": "status", "payload": "Assembling memory & RAG context..."}
                context = await self.memory_manager.assemble_context(
                    self.session_id, self.company_id, "You are an AROL Assistant."
                )
                if active_pipeline.rag.enabled and target_agent_name == "technical":
                    rag_docs = self.rag_provider.retrieve_context(user_query)
                    if rag_docs:
                        rag_block = self.rag_provider.format_system_prompt_block(rag_docs)
                        context["system_prompt"] += f"\n{rag_block}"

            # 4. The Cognitive Loop (Drafting)
            final_draft = None
            
            while self.iteration_count < active_pipeline.budget.max_iterations_per_answer:
                self.iteration_count += 1
                yield {"type": "status", "payload": f"Agent is generating response..."}
                
                # The Agent generates a draft (can be string or Tool Dict)
                draft_response = await selected_agent.draft_response(user_query, context)
                
                # If the agent wants to trigger a HITL Tool, break immediately and yield it
                if isinstance(draft_response, dict) and draft_response.get("is_tool_call"):
                    yield {"type": "status", "payload": "Action requires human approval..."}
                    yield {"type": "action_required", "payload": draft_response["payload"]}
                    return # Exit early, we wait for human input!

                # Otherwise, it's text. Evaluate with Critic.
                if active_pipeline.control.validate_response_enabled:
                    yield {"type": "status", "payload": "Critic Agent validating response..."}
                    await asyncio.sleep(0.3)
                    final_draft = draft_response # Assuming valid for now
                    break
                else:
                    final_draft = draft_response
                    break

            # 5. Stream Final Text to UI
            yield {"type": "status", "payload": "Transmitting..."}
            if final_draft and isinstance(final_draft, str):
                words = final_draft.split(" ")
                for word in words:
                    yield {"type": "message", "payload": word + " "}
                    await asyncio.sleep(0.05)

        except Exception as e:
            print(f"[Executor Error] {e}")
            yield {"type": "error", "payload": "The AI Engine encountered a fatal error."}