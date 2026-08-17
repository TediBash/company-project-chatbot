# app/pipeline/memory.py
from typing import List, Dict, Any, Optional
import json
from app.database import db
from app.pipeline.config import active_pipeline

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
        """Returns the last N messages in standard role/content dictionary format."""
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


# ============================================================================
# 2. INDEPENDENT OBJECT: Stateful Roadmap Provider
# ============================================================================
class RoadmapMemoryProvider:
    """Fetches and formats the procedural state machine from PostgreSQL."""

    async def get_roadmap(self, session_id: str, company_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves raw roadmap JSON from the database."""
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
        """Converts raw roadmap state into a concise instruction block for the LLM."""
        if not roadmap_data or not roadmap_data.get("steps"):
            return ""

        objective = roadmap_data.get("objective", "Unspecified Task")
        steps = roadmap_data.get("steps", [])

        lines = [
            "\n### ACTIVE PROCEDURE STATE",
            f"Current Objective: {objective}",
            "Roadmap Steps:",
        ]

        for idx, step in enumerate(steps, 1):
            status = step.get("status", "pending").upper()
            task = step.get("task", "")
            lines.append(f"  {idx}. [{status}] {task}")

        lines.append(
            "Instructions: Focus on guiding the user through the active/pending step. "
            "Do not skip steps unless instructed by the technician."
        )
        return "\n".join(lines)


# ============================================================================
# 3. INDEPENDENT OBJECT: Long-Term Memory / Summary Provider
# ============================================================================
class LongTermMemoryProvider:
    """Fetches high-level historical summaries for long-running sessions."""

    async def get_summary(self, session_id: str, company_id: str) -> Optional[str]:
        async with db.tenant_connection(company_id) as conn:
            row = await conn.fetchrow(
                """
                SELECT summary_text
                FROM app_chat.chat_summaries
                WHERE session_id = $1
                ORDER BY updated_at DESC
                LIMIT 1
                """,
                session_id,
            )
            return row["summary_text"] if row else None

    def format_system_prompt_block(self, summary_text: Optional[str]) -> str:
        if not summary_text:
            return ""
        return f"\n### CONVERSATION HISTORICAL SUMMARY\n{summary_text.strip()}\n"


# ============================================================================
# 4. INDEPENDENT OBJECT: Token Optimizer & Trimmer
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
        # Fallback estimation: ~4 characters per token
        return len(text) // 4

    def trim_history(self, messages: List[Dict[str, str]], max_token_budget: int) -> List[Dict[str, str]]:
        """Drop oldest messages first if history exceeds token budget."""
        trimmed = list(messages)
        while trimmed:
            total_tokens = sum(self.count_tokens(m["content"]) for m in trimmed)
            if total_tokens <= max_token_budget:
                break
            # Remove oldest message (from the front)
            trimmed.pop(0)
        return trimmed


# ============================================================================
# 5. ORCHESTRATOR: Memory Pipeline Manager
# ============================================================================
class MemoryPipelineManager:
    """Coordinates individual memory objects based on active configuration flags."""

    def __init__(self):
        self.short_term = ShortTermMemoryProvider(limit=active_pipeline.memory.max_history_messages)
        self.roadmap = RoadmapMemoryProvider()
        self.long_term = LongTermMemoryProvider()
        self.optimizer = TokenOptimizer()

    async def assemble_context(
        self, session_id: str, company_id: str, base_system_prompt: str
    ) -> Dict[str, Any]:
        """
        Builds the final prompt payload respecting all enabled memory modules.
        Returns:
            {
                "system_prompt": str,
                "messages": List[Dict[str, str]],
                "roadmap_state": Optional[Dict],
                "tokens_used": int
            }
        """
        system_blocks = [base_system_prompt]
        roadmap_data = None
        messages = []

        # 1. Long-Term Memory (if enabled)
        if active_pipeline.memory.long_term_enabled:
            summary = await self.long_term.get_summary(session_id, company_id)
            summary_block = self.long_term.format_system_prompt_block(summary)
            if summary_block:
                system_blocks.append(summary_block)

        # 2. Stateful Roadmap (if enabled)
        if active_pipeline.memory.roadmap_enabled:
            roadmap_data = await self.roadmap.get_roadmap(session_id, company_id)
            roadmap_block = self.roadmap.format_system_prompt_block(roadmap_data)
            if roadmap_block:
                system_blocks.append(roadmap_block)

        # 3. Short-Term History (if enabled)
        if active_pipeline.memory.short_term_enabled:
            raw_messages = await self.short_term.get_messages(session_id, company_id)
            # Apply token budget trimming
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