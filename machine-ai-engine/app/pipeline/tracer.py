# app/pipeline/tracer.py
import time
from typing import Dict, Any, List, Optional
import litellm
from app.db.session import AsyncSessionLocal
from app.db.models import AITelemetryTrace

class AITrajectoryTracer:
    """
    Acts as a flight data recorder for the Agentic Loop. 
    Captures every tool call, LLM reasoning step, and cost metric in chronological order.
    """
    
    def __init__(self, session_id: str, company_id: str, user_id: Optional[str] = None):
        self.session_id = session_id
        self.company_id = company_id
        self.user_id = user_id
        
        self.start_time = time.time()
        self.question = ""
        self.target_agent = "unknown"
        
        # The chronological timeline of what the AI is doing
        self.steps: List[Dict[str, Any]] = []
        
        # Running totals
        self.total_tokens_in = 0
        self.total_tokens_out = 0
        self.total_cost_usd = 0.0

    def add_step(self, step_name: str, action_type: str, details: Dict[str, Any]):
        """
        Appends a generic action to the trajectory timeline (e.g., Tool execution, DB lookup).
        """
        step_record = {
            "step": len(self.steps) + 1,
            "timestamp": round(time.time() - self.start_time, 3),
            "step_name": step_name,
            "action_type": action_type, # e.g., 'routing', 'tool_call', 'tool_result'
            "details": details
        }
        self.steps.append(step_record)
        print(f"[Tracer] 📍 Step {step_record['step']}: {step_name}")

    def add_llm_step(
        self, 
        step_name: str, 
        model_name: str, 
        messages: List[Dict[str, Any]], 
        response: str,
        structured_output: Optional[Dict[str, Any]] = None
    ):
        """
        Appends an LLM inference step, automatically calculating exact tokens and costs.
        """
        tokens_in = 0
        tokens_out = 0
        cost = 0.0
        
        # Attempt to calculate exact tokens and cost
        try:
            tokens_in = litellm.token_counter(model=model_name, messages=messages)
            tokens_out = litellm.token_counter(model=model_name, text=response)
            
            if not model_name.startswith("ollama/"):
                cost_tuple = litellm.cost_per_token(model=model_name, prompt_tokens=tokens_in, completion_tokens=tokens_out)
                cost = cost_tuple[0] + cost_tuple[1] if isinstance(cost_tuple, tuple) else cost_tuple
        except Exception:
            pass # Fallback to 0 if tokenizer fails

        # Accumulate totals
        self.total_tokens_in += tokens_in
        self.total_tokens_out += tokens_out
        self.total_cost_usd += cost

        step_record = {
            "step": len(self.steps) + 1,
            "timestamp": round(time.time() - self.start_time, 3),
            "step_name": step_name,
            "action_type": "llm_inference",
            "model": model_name,
            "metrics": {
                "tokens_in": tokens_in,
                "tokens_out": tokens_out,
                "cost_usd": cost
            },
            "payload": {
                "prompt_messages": messages,
                "raw_response": response,
                "structured_data": structured_output
            }
        }
        self.steps.append(step_record)
        print(f"[Tracer] 🧠 Step {step_record['step']}: {step_name} ({tokens_in} in / {tokens_out} out)")

    async def save_trajectory(self, final_answer: str):
        """
        Finalizes the total latency and pushes the complete flight record to PostgreSQL.
        """
        total_latency = round(time.time() - self.start_time, 3)
        
        trace = AITelemetryTrace(
            session_id=self.session_id,
            company_id=self.company_id,
            user_id=self.user_id,
            question=self.question,
            final_answer=final_answer,
            target_agent=self.target_agent,
            trajectory_steps=self.steps,
            total_tokens_in=self.total_tokens_in,
            total_tokens_out=self.total_tokens_out,
            total_cost_usd=self.total_cost_usd,
            total_latency_sec=total_latency
        )

        try:
            async with AsyncSessionLocal() as session:
                session.add(trace)
                await session.commit()
                print(f"\n✅ [Tracer] Trajectory saved to DB! Total Latency: {total_latency}s, Cost: ${self.total_cost_usd:.5f}\n")
        except Exception as e:
            print(f"❌ [Tracer] Failed to save trajectory to DB: {e}")