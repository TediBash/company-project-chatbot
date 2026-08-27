# ingest_txt.py
import os
from pathlib import Path
from app.rag.provider import RAGPipelineProvider

def run_ingestion():
    # 1. Initialize the unified RAG Provider
    rag_provider = RAGPipelineProvider()
    
    # 2. Define your TXT and target serial number
    txt_path = Path("./data/manuals/A2055_manual_en.txt")
    
    # Dynamically extract "A2055" from the filename
    filename = os.path.basename(txt_path)
    target_serial = filename.split('_')[0] if '_' in filename else "A2055"
    
    if not txt_path.exists():
        print(f"❌ Error: Could not find TXT at {txt_path}")
        txt_path.parent.mkdir(parents=True, exist_ok=True)
        print(f"Created directory {txt_path.parent}. Please place your TXT there and run again.")
        return

    print(f"📄 Processing '{txt_path.name}' for machine serial '{target_serial}'...")
    
    # 3. Call the unified ingest_manual method
    try:
        chunks_added = rag_provider.ingest_manual(
            file_path=txt_path, 
            serial_number=target_serial
        )
        
        print(f"✅ Success! Indexed {chunks_added} semantic chunks into Vector DB.")
        
        # Try to show the total count if your vector store supports it
        try:
            print(f"Database now contains {rag_provider.vector_store.count()} total vectors.")
        except AttributeError:
            pass 
            
    except Exception as e:
        print(f"❌ Failed to insert documents: {e}")

if __name__ == "__main__":
    run_ingestion()