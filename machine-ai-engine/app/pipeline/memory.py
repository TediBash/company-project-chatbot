# app/pipeline/memory.py
import json
from typing import List, Dict, Any, Optional
from app.database import db
from app.pipeline.config import active_pipeline
from app.rag.vector_store import VectorStoreManager

try:
    import tiktoken
    TIKTOKEN_AVAILABLE = True
except ImportError:
    TIKTOKEN_AVAILABLE = False


# ============================================================================
# 1. INDEPENDENT OBJECT: Short-Term Memory Provider
# ============================================================================
class ShortTermMemoryProvider:
    """Fetches the sliding window of recent conversation turns from PostgreSQL."""

    def __init__(self, limit: int = 6):
        self.limit = limit

    async def get_messages(self, session_id: str, company_id: str) -> List[Dict[str, str]]:
        """Returns the last N messages in standard role/content dictionary format (oldest to newest)."""
        async with db.tenant_connection(company_id) as conn:
            rows = await conn.fetch(
                """
                SELECT role, content
                FROM app_chat.chat_messages
                WHERE session_id = $1 AND role IN ('user', 'assistant')
                ORDER BY created_at DESC
                LIMIT $2
                """,
                session_id,
                self.limit,
            )

        # Reverse rows so they are in chronological order (oldest to newest)
        return [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]

    async def get_full_history(self, session_id: str, company_id: str, limit: int = 50) -> List[Dict[str, str]]:
        """Returns an extended chronological history for context-aware routing and analysis."""
        async with db.tenant_connection(company_id) as conn:
            rows = await conn.fetch(
                """
                SELECT role, content
                FROM app_chat.chat_messages
                WHERE session_id = $1 AND role IN ('user', 'assistant')
                ORDER BY created_at DESC
                LIMIT $2
                """,
                session_id,
                limit,
            )
        return [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]


# ============================================================================
# 2. INDEPENDENT OBJECT: Stateful Roadmap Provider
# ============================================================================
class RoadmapMemoryProvider:
    """Fetches and formats the procedural state machine from PostgreSQL."""

    async def get_roadmap(self, session_id: str, company_id: str) -> Optional[Dict[str, Any]]:
        async with db.tenant_connection(company_id) as conn:
            row = await conn.fetchrow(
                """
                SELECT roadmap_json
                FROM app_chat.chat_roadmaps
                WHERE session_id = $1
                """,
                session_id,
            )
            if row and row["roadmap_json"]:
                data = row["roadmap_json"]
                return json.loads(data) if isinstance(data, str) else data
            return None

    def format_system_prompt_block(self, roadmap_data: Optional[Dict[str, Any]]) -> str:
        """Converts raw roadmap state into an intelligent 'Focus Window' for the LLM."""
        if not roadmap_data or not roadmap_data.get("steps"):
            return ""

        objective = roadmap_data.get("objective", "Unspecified Task")
        steps = roadmap_data.get("steps", [])

        lines = [
            "\n### ACTIVE PROCEDURE STATE",
            f"Current Objective: {objective}"
        ]

        completed_count = 0
        active_step_idx = -1

        # Locate the active threshold
        for idx, step in enumerate(steps):
            if step.get("status") == "completed":
                completed_count += 1
            elif active_step_idx == -1 and step.get("status") in ["pending", "failed", "in_progress"]:
                active_step_idx = idx

        # 1. Compress the past
        if completed_count > 0:
            lines.append(f"Steps 1 to {completed_count}: [COMPLETED]")

        # 2. Expand the present (The Active Step)
        if active_step_idx != -1:
            active_step = steps[active_step_idx]
            status = active_step.get("status", "pending").upper()
            task = active_step.get("task", "")
            notes = active_step.get("notes", "")

            lines.append(f"\n>> CURRENT ACTIVE STEP (Step {active_step_idx + 1}): [{status}] {task}")
            if notes:
                lines.append(f"   Context/Blocker: {notes}")
        else:
            lines.append("\n>> All procedure steps are marked as completed.")

        # 3. Peek at the future (Max 2 steps ahead to save tokens)
        if active_step_idx != -1 and active_step_idx + 1 < len(steps):
            lines.append("\nUpcoming Steps:")
            for i in range(active_step_idx + 1, min(active_step_idx + 3, len(steps))):
                lines.append(f"  Step {i + 1}: {steps[i].get('task', '')}")

        # 4. Enforce Agent Agency
        lines.append(
            "\nINSTRUCTIONS: Focus entirely on guiding the user through the CURRENT ACTIVE STEP. "
            "Do not skip ahead. If the user confirms they have finished it, you MUST use your roadmap_update tool to mark it COMPLETED."
        )
        return "\n".join(lines)


# ============================================================================
# 3. INDEPENDENT OBJECT: Long-Term Memory (Semantic Vector Store)
# ============================================================================
class LongTermMemoryProvider:
    """Fetches highly relevant historical facts across all sessions for a user/company."""

    def __init__(self):
        self.vector_store = VectorStoreManager(collection_name="user_long_term_memory")

    def get_relevant_facts(self, company_id: str, query: str, top_k: int = 3) -> str:
        """Queries the vector store for facts related to the current user query."""
        results = self.vector_store.query(
            query_text=query, 
            top_k=top_k, 
            where_filter={"company_id": company_id}
        )
        if not results:
            return ""
        
        lines = ["\n### RELEVANT HISTORICAL FACTS"]
        for res in results:
            lines.append(f"- {res['text']}")
        return "\n".join(lines)


# ============================================================================
# 4. INDEPENDENT OBJECT: Session State & Variable Pinning Cache
# ============================================================================
class SessionStateProvider:
    """Manages ephemeral session-pinned variables (e.g., pinned RAG chunks for step-by-step flows)."""
    
    def __init__(self):
        # In-memory store keyed by session_id -> {key: value}
        self._store: Dict[str, Dict[str, Any]] = {}

    def set_variable(self, session_id: str, key: str, value: Any) -> None:
        if session_id not in self._store:
            self._store[session_id] = {}
        self._store[session_id][key] = value

    def get_variable(self, session_id: str, key: str, default: Any = None) -> Any:
        return self._store.get(session_id, {}).get(key, default)


# ============================================================================
# 5. INDEPENDENT OBJECT: Token Optimizer & Trimmer
# ============================================================================
class TokenOptimizer:
    """Calculates token counts and trims message history to respect budgets."""

    def __init__(self, model_name: str = "gpt-4o"):
        self.model_name = model_name
        if TIKTOKEN_AVAILABLE:
            try:
                self.encoder = tiktoken.encoding_for_model(model_name)
            except KeyError:
                self.encoder = tiktoken.get_encoding("cl100k_base")
        else:
            self.encoder = None

    def count_tokens(self, text: str) -> int:
        if self.encoder:
            return len(self.encoder.encode(text))
        return len(text) // 4

    def trim_history(self, messages: List[Dict[str, str]], max_token_budget: int) -> List[Dict[str, str]]:
        """Drops oldest middle messages first, always preserving the 'Anchor' (first user message)."""
        if not messages:
            return []

        anchor = None
        if len(messages) > 0 and messages[0]["role"] == "user":
            anchor = messages[0]
            working_list = messages[1:]
        else:
            working_list = list(messages)

        while working_list:
            current_tokens = sum(self.count_tokens(m["content"]) for m in working_list)
            if anchor:
                current_tokens += self.count_tokens(anchor["content"])

            if current_tokens <= max_token_budget:
                break
                
            working_list.pop(0)

        if anchor:
            return [anchor] + working_list
        return working_list


# ============================================================================
# 6. ORCHESTRATOR: Memory Pipeline Manager
# ============================================================================
class MemoryPipelineManager:
    """Coordinates individual memory objects based on active configuration flags."""

    def __init__(self):
        self.short_term = ShortTermMemoryProvider(limit=active_pipeline.memory.max_history_messages)
        self.roadmap = RoadmapMemoryProvider()
        self.long_term = LongTermMemoryProvider()
        self.session_state = SessionStateProvider()
        self.optimizer = TokenOptimizer()

    async def get_chat_history(self, session_id: str, company_id: str, limit: int = 30) -> List[Dict[str, str]]:
        """Exposes full/extended chat history retrieval for intent routing and context evaluation."""
        return await self.short_term.get_full_history(session_id, company_id, limit)

    async def save_session_variable(self, session_id: str, key: str, value: Any) -> None:
        """Saves a temporary session-pinned state variable (e.g. pinned RAG context)."""
        self.session_state.set_variable(session_id, key, value)

    async def get_session_variable(self, session_id: str, key: str, default: Any = None) -> Any:
        """Retrieves a temporary session-pinned state variable."""
        return self.session_state.get_variable(session_id, key, default)

    async def assemble_context(
        self, session_id: str, company_id: str, base_system_prompt: str, user_query: str = ""
    ) -> Dict[str, Any]:
        """
        Builds the final prompt payload respecting all enabled memory modules.
        """
        system_blocks = [base_system_prompt]
        roadmap_data = None
        messages = []

        # 1. Long-Term Semantic Memory (if enabled and query provided)
        if active_pipeline.memory.long_term_enabled and user_query:
            facts = self.long_term.get_relevant_facts(company_id, user_query)
            if facts:
                system_blocks.append(facts)

        # 2. Stateful Roadmap (if enabled)
        if active_pipeline.memory.roadmap_enabled:
            roadmap_data = await self.roadmap.get_roadmap(session_id, company_id)
            roadmap_block = self.roadmap.format_system_prompt_block(roadmap_data)
            if roadmap_block:
                system_blocks.append(roadmap_block)

        # 3. Short-Term History (if enabled)
        if active_pipeline.memory.short_term_enabled:
            raw_messages = await self.short_term.get_messages(session_id, company_id)
            messages = self.optimizer.trim_history(
                raw_messages, max_token_budget=active_pipeline.budget.max_tokens_per_answer // 2
            )

        final_system_prompt = "\n".join(system_blocks)
        total_tokens = self.optimizer.count_tokens(final_system_prompt) + sum(
            self.optimizer.count_tokens(m["content"]) for m in messages
        )

        return {
            "system_prompt": final_system_prompt,
            "messages": messages,
            "roadmap_state": roadmap_data,
            "tokens_used": total_tokens,
        }