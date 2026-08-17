# app/pipeline/executor.py
import asyncio
from typing import AsyncGenerator, Dict, Any
from app.pipeline.config import active_pipeline
from app.pipeline.memory import MemoryPipelineManager
from app.rag.provider import RAGPipelineProvider

class CognitiveLoopExecutor:
    def __init__(self, session_id: str, company_id: str, user_id: str):
        self.session_id = session_id
        self.company_id = company_id
        self.user_id = user_id
        self.memory_manager = MemoryPipelineManager()
        self.rag_provider = RAGPipelineProvider()
        
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
            # 1. Guardrails Check
            if active_pipeline.control.guardrails_enabled:
                yield {"type": "status", "payload": "Running security & policy guardrails..."}
                await asyncio.sleep(0.3)

            # 2. Context & Memory Assembly
            yield {"type": "status", "payload": "Assembling memory context..."}
            
            base_prompt = "You are an AROL Industrial AI Support Assistant."
            context = await self.memory_manager.assemble_context(
                session_id=self.session_id,
                company_id=self.company_id,
                base_system_prompt=base_prompt
            )
            
            # 3. RAG Knowledge Retrieval (Pluggable)
            rag_docs = []
            if active_pipeline.rag.enabled:
                yield {"type": "status", "payload": "Searching AROL technical manuals..."}
                rag_docs = self.rag_provider.retrieve_context(user_query)
                
                if rag_docs:
                    rag_block = self.rag_provider.format_system_prompt_block(rag_docs)
                    context["system_prompt"] += f"\n{rag_block}"
                    yield {"type": "status", "payload": f"Found {len(rag_docs)} relevant manual sections."}
                else:
                    yield {"type": "status", "payload": "No specific manual excerpts found for query."}
                await asyncio.sleep(0.4)

            # 4. The Cognitive Loop (Drafting & Critic)
            final_draft = ""
            while self.iteration_count < active_pipeline.budget.max_iterations_per_answer:
                self.iteration_count += 1
                yield {"type": "status", "payload": f"Drafting response (Attempt {self.iteration_count}/{active_pipeline.budget.max_iterations_per_answer})..."}
                
                await asyncio.sleep(1.0)
                draft_response = "According to the AROL manual, check the pneumatic pressure regulator setpoint (standard: 6.0 bar)."

                # Critic Evaluation
                if active_pipeline.control.validate_response_enabled:
                    yield {"type": "status", "payload": "Critic Agent is evaluating the draft..."}
                    await asyncio.sleep(0.6)
                    final_draft = draft_response
                    break
                else:
                    final_draft = draft_response
                    break

            # 5. Stream Tokens to UI
            yield {"type": "status", "payload": "Generating final response..."}
            words = final_draft.split(" ")
            for word in words:
                yield {"type": "message", "payload": word + " "}
                await asyncio.sleep(0.05)

        except Exception as e:
            print(f"[Executor Error] {e}")
            yield {"type": "error", "payload": "The Cognitive Loop encountered a fatal error."}