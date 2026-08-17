# Example: app/agents/technical_agent.py (Streaming response)
from app.llm.factory import get_llm
from app.llm.schemas import LLMTarget

async def stream_troubleshooting_answer(context_prompt: str):
    # Gets the model designated for Technical RAG (e.g. Llama 70B, GPT-4o, or Gemini)
    tech_llm = get_llm(LLMTarget.TECHNICAL_AGENT)
    
    messages = [
        {"role": "system", "content": "You are an expert AROL machine technician..."},
        {"role": "user", "content": context_prompt}
    ]
    
    async for token in tech_llm.astream(messages):
        yield token