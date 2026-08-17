# app/rag/reranker.py
from typing import List, Dict, Any

try:
    from sentence_transformers import CrossEncoder
    CROSS_ENCODER_AVAILABLE = True
except ImportError:
    CROSS_ENCODER_AVAILABLE = False


class CrossEncoderReRanker:
    """
    Pluggable re-ranker to re-order vector search results by semantic match.
    """

    def __init__(self, model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"):
        self.model_name = model_name
        self.model = None
        if CROSS_ENCODER_AVAILABLE:
            try:
                self.model = CrossEncoder(model_name)
            except Exception as e:
                print(f"[ReRanker Warning] Could not load cross-encoder: {e}")

    def rerank(
        self, query: str, documents: List[Dict[str, Any]], top_k: int = 3
    ) -> List[Dict[str, Any]]:
        """
        Re-ranks a list of retrieved documents for a given query.
        """
        if not documents:
            return []

        if not self.model:
            # Fallback if cross-encoder is disabled or unavailable
            return documents[:top_k]

        pairs = [[query, doc["text"]] for doc in documents]
        scores = self.model.predict(pairs)

        for idx, score in enumerate(scores):
            documents[idx]["rerank_score"] = float(score)

        # Sort descending by re-rank score
        ranked = sorted(documents, key=lambda x: x.get("rerank_score", 0.0), reverse=True)
        return ranked[:top_k]