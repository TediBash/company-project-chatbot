# app/agents/orchestrator.py
from app.llm.factory import get_llm
from app.llm.schemas import LLMTarget
from app.prompts.registry import prompt_registry

async def route_user_query(user_prompt: str, user_role: str) -> str:
    # 1. Fetch and render the latest prompt template
    prompt_data = prompt_registry.render(
        name="router",
        variables={"user_query": user_prompt, "user_role": user_role}
    )
    
    # 2. Get the designated LLM
    router_llm = get_llm(LLMTarget.ROUTER)
    
    # 3. Format the messages
    messages = [
        {"role": "system", "content": prompt_data.system_message},
        {"role": "user", "content": prompt_data.user_message}
    ]
    
    # 4. Execute (Applying the prompt's specific temperature/tokens)
    decision = await router_llm.acomplete(
        messages=messages,
        temperature=prompt_data.model_defaults.temperature,
        max_tokens=prompt_data.model_defaults.max_tokens
    )
    
    # 5. Observability Hook (Phase 6)
    # When we build the Tracer, we will log:
    # prompt_name: prompt_data.name ("router")
    # prompt_version: prompt_data.version ("1.0")
    # This proves EXACTLY which prompt version generated the output!
    
    return decision.strip().lower()