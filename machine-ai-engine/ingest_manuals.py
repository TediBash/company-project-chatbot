# scripts/ingest_manuals.py
import os
import glob
import chromadb
from chromadb.utils import embedding_functions
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter

# 1. Force Chroma to use the exact same embedder your main app uses!
sentence_transformer_ef = embedding_functions.SentenceTransformerEmbeddingFunction(model_name="all-MiniLM-L6-v2")

# Initialize ChromaDB
chroma_client = chromadb.PersistentClient(path="./data/chroma_db")
collection = chroma_client.get_or_create_collection(
    name="arol_manuals",
    embedding_function=sentence_transformer_ef
)

def ingest_all_manuals():
    pdf_files = glob.glob("data/manuals/*_manual_*.pdf")
    print(f"Found {len(pdf_files)} manuals to ingest.")
    
    # Slightly larger chunks (1500) reduces database bloat while keeping precision
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1500, chunk_overlap=200)

    for file_path in pdf_files:
        filename = os.path.basename(file_path)
        serial_number = filename.split("_")[0]
        
        print(f"\n➡️ Processing Serial Number: {serial_number} ...")
        
        # Load the PDF
        loader = PyPDFLoader(file_path)
        pages = loader.load()
        print(f"📄 Successfully read {len(pages)} pages from {filename}.")
        
        # Split into chunks
        chunks = text_splitter.split_documents(pages)
        print(f"✂️ Split {len(pages)} pages into {len(chunks)} chunks.")
        
        # Prepare data arrays
        documents = []
        metadatas = []
        ids = []
        
        for i, chunk in enumerate(chunks):
            documents.append(chunk.page_content)
            metadatas.append({
                "serial_number": serial_number,
                "source": filename,
                "page": chunk.metadata.get("page", 0)
            })
            ids.append(f"{serial_number}_chunk_{i}")
            
        # 2. Batch the Upserts! (Crucial for 200+ page PDFs)
        batch_size = 300
        for i in range(0, len(documents), batch_size):
            end_idx = min(i + batch_size, len(documents))
            collection.upsert(
                documents=documents[i:end_idx],
                metadatas=metadatas[i:end_idx],
                ids=ids[i:end_idx]
            )
            print(f"   💾 Saved chunks {i} to {end_idx}...")
            
        print(f"✅ Ingestion complete for SN: {serial_number}!")

if __name__ == "__main__":
    ingest_all_manuals()