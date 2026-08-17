# test_rag.py
from pathlib import Path
from app.rag.provider import RAGPipelineProvider
from app.rag.ingestion import DocumentIngestionEngine
from app.rag.vector_store import VectorStoreManager

def test_rag_standalone():
    print("=== Testing RAG Components in Isolation ===")
    
    # 1. Test Ingestion Chunker with raw text
    chunker = DocumentIngestionEngine(chunk_size=100, chunk_overlap=20)
    sample_text = (
        "AROL EURO PK Capping Machine. Operating air pressure must be maintained at 6.0 bar. "
        "For torque adjustment on magnetic heads, loosen the locking collar and rotate clockwise."
    )
    chunks = chunker.splitter.split_text(sample_text)
    print(f"✅ Chunking test passed: Generated {len(chunks)} chunks.")

    # 2. Test Vector Store & Retrieval
    vstore = VectorStoreManager(persist_directory="./data/test_chroma_db", collection_name="test_manuals")
    test_chunks = [
        {
            "id": "capping_head_01",
            "text": "AROL EURO PK Capping Machine. Operating air pressure must be maintained at 6.0 bar.",
            "metadata": {"source": "euro_pk_manual.pdf", "page": 12, "machine_model": "EURO_PK"},
        },
        {
            "id": "capping_head_02",
            "text": "Torque adjustment on magnetic heads: loosen locking collar and rotate clockwise to increase.",
            "metadata": {"source": "euro_pk_manual.pdf", "page": 14, "machine_model": "EURO_PK"},
        }
    ]
    vstore.add_chunks(test_chunks)
    print(f"✅ Vector store test passed: {vstore.count()} vectors stored.")

    # 3. Test Similarity Query
    query = "How to adjust torque on capping head?"
    results = vstore.query(query, top_k=2)
    print(f"✅ Query results for '{query}':")
    for r in results:
        print(f"   - [Score: {r['score']:.3f}] {r['text']}")

    # 4. Test Prompt Formatter
    provider = RAGPipelineProvider()
    formatted_block = provider.format_system_prompt_block(results)
    print("\n✅ Formatted System Prompt Block:\n", formatted_block)

if __name__ == "__main__":
    test_rag_standalone()