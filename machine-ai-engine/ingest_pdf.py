# ingest_pdf.py
import asyncio
from pathlib import Path
from app.rag.provider import RAGPipelineProvider

def run_ingestion():
    # 1. Initialize your existing RAG Provider
    rag_provider = RAGPipelineProvider()
    
    # 2. Define your PDF and target machine
    pdf_path = Path("./data/manuals/15610_manual_EN.pdf")
    target_machine = "TS - EURO PK TWIN CHUTE D"
    
    if not pdf_path.exists():
        print(f"❌ Error: Could not find PDF at {pdf_path}")
        # Create the directory for them so it's easy
        pdf_path.parent.mkdir(parents=True, exist_ok=True)
        print(f"Created directory {pdf_path.parent}. Please place your PDF there and run again.")
        return

    print(f"📄 Processing '{pdf_path.name}' for machine '{target_machine}'...")
    
    # 3. Call your existing ingest_manual method
    chunks_added = rag_provider.ingest_manual(
        file_path=pdf_path, 
        machine_model=target_machine
    )
    
    print(f"✅ Success! Indexed {chunks_added} chunks into Vector DB.")
    print(f"Database now contains {rag_provider.vector_store.count()} total vectors.")

if __name__ == "__main__":
    run_ingestion()