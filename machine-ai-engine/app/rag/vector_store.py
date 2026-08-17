# app/rag/vector_store.py
from pathlib import Path
from typing import List, Dict, Any, Optional
import chromadb
from chromadb.utils import embedding_functions


class VectorStoreManager:
    """
    Independent ChromaDB manager for vector indexing and similarity search.
    """

    def __init__(
        self,
        persist_directory: str = "./data/chroma_db",
        collection_name: str = "arol_technical_manuals",
        model_name: str = "all-MiniLM-L6-v2",
    ):
        self.persist_directory = Path(persist_directory)
        self.persist_directory.mkdir(parents=True, exist_ok=True)

        # Initialize Chroma persistent client
        self.client = chromadb.PersistentClient(path=str(self.persist_directory))

        # Use sentence-transformers for local, free, high-performance embeddings
        self.embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name=model_name
        )

        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            embedding_function=self.embedding_fn,
            metadata={"hnsw:space": "cosine"},
        )

    def add_chunks(self, chunks: List[Dict[str, Any]]) -> int:
        """
        Adds prepared chunks into ChromaDB.
        """
        if not chunks:
            return 0

        ids = [c["id"] for c in chunks]
        documents = [c["text"] for c in chunks]
        metadatas = [c["metadata"] for c in chunks]

        self.collection.upsert(
            ids=ids,
            documents=documents,
            metadatas=metadatas,
        )
        return len(chunks)

    def query(
        self,
        query_text: str,
        top_k: int = 3,
        where_filter: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Performs vector similarity search.
        """
        results = self.collection.query(
            query_texts=[query_text],
            n_results=top_k,
            where=where_filter if where_filter else None,
        )

        formatted_results = []
        if results and results["documents"] and len(results["documents"][0]) > 0:
            docs = results["documents"][0]
            metadatas = results["metadatas"][0] if results["metadatas"] else [{}] * len(docs)
            distances = results["distances"][0] if results["distances"] else [0.0] * len(docs)
            ids = results["ids"][0] if results["ids"] else [""] * len(docs)

            for doc_id, text, meta, dist in zip(ids, docs, metadatas, distances):
                formatted_results.append({
                    "id": doc_id,
                    "text": text,
                    "metadata": meta,
                    "score": 1.0 - dist,  # Cosine similarity score
                })

        return formatted_results

    def count(self) -> int:
        """Returns total vectors stored in collection."""
        return self.collection.count()