# app/rag/provider.py
from typing import List, Dict, Any, Optional
from pathlib import Path
from app.pipeline.config import active_pipeline
from app.rag.ingestion import DocumentIngestionEngine
from app.rag.vector_store import VectorStoreManager
from app.rag.reranker import CrossEncoderReRanker


class RAGPipelineProvider:
    """
    Central provider that coordinates RAG operations according to pipeline configuration flags.
    """

    def __init__(self):
        self.ingestion = DocumentIngestionEngine()
        self.vector_store = VectorStoreManager()
        self.reranker = CrossEncoderReRanker()

    def ingest_manual(self, file_path: str | Path, serial_number: Optional[str] = None) -> int:
        """Helper to index a technical manual strictly by its serial number."""
        extra_meta = {"serial_number": serial_number} if serial_number else None
        chunks = self.ingestion.chunk_document(file_path, extra_metadata=extra_meta)
        return self.vector_store.add_chunks(chunks)

    def retrieve_context(
        self, query_text: str, serial_number: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Retrieves relevant manual snippets adhering to active pipeline configs.
        Filters strictly by the physical machine's serial number.
        """
        if not active_pipeline.rag.enabled:
            return []

        # If re-ranking is enabled, fetch 2x candidates first
        fetch_k = (
            active_pipeline.rag.top_k * 2
            if active_pipeline.rag.reranking_enabled
            else active_pipeline.rag.top_k
        )

        filter_meta = {"serial_number": serial_number} if serial_number else None
        
        candidates = self.vector_store.query(
            query_text=query_text,
            top_k=fetch_k,
            where_filter=filter_meta,
        )

        if active_pipeline.rag.reranking_enabled:
            return self.reranker.rerank(
                query=query_text,
                documents=candidates,
                top_k=active_pipeline.rag.top_k,
            )

        return candidates[: active_pipeline.rag.top_k]

    def format_system_prompt_block(self, retrieved_docs: List[Dict[str, Any]]) -> str:
        """
        Converts retrieved manual excerpts into a structured block for the LLM prompt.
        """
        if not retrieved_docs:
            return ""

        lines = [
            "\n### TECHNICAL MANUAL EXCERPTS (AROL KNOWLEDGE BASE)",
            "Use the following verified manual documentation to formulate your technical guidance:",
        ]

        for idx, doc in enumerate(retrieved_docs, 1):
            meta = doc.get("metadata", {})
            source = meta.get("source", "Manual")
            page = meta.get("page", "?")
            lines.append(f"\n--- Excerpt {idx} [Source: {source}, Page {page}] ---")
            lines.append(doc["text"].strip())

        lines.append(
            "\nRule: Base mechanical tolerances, pressures, and part numbers strictly on the excerpts above."
        )
        return "\n".join(lines)