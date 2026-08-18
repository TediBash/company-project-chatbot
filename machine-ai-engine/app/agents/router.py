# app/agents/router.py
import asyncio
from typing import Literal

AgentType = Literal["technical", "commercial", "operational", "general"]

class IntentRouter:
    """Classifies user queries to route them to the correct specialized agent."""
    
    async def route(self, query: str) -> AgentType:
        """
        In production, this calls a fast, cheap LLM (like GPT-4o-mini or Qwen)
        to strictly classify the intent.
        """
        query_lower = query.lower()
        
        # Mock LLM Classification Logic
        await asyncio.sleep(0.5) 
        
        if any(word in query_lower for word in ["quote", "price", "buy", "order", "purchase", "commercial"]):
            return "commercial"
            
        if any(word in query_lower for word in ["temperature", "speed", "telemetry", "dashboard", "live"]):
            return "operational"
            
        if any(word in query_lower for word in ["error", "broken", "replace", "manual", "pressure", "capping"]):
            return "technical"
            
        return "general"