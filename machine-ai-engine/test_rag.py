# scripts/test_rag.py
import os
import sys

# Ensure the 'app' module can be found
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.rag.provider import RAGPipelineProvider

def test_retrieval():
    provider = RAGPipelineProvider()
    
    # ⚠️ Change this to a Serial Number you actually just ingested!
    target_serial_number = "17478" 
    
    # Example question a technician might ask
    test_query = "What is the recommended air pressure and how do I resolve a low pressure alarm?"
    
    print(f"🔍 Searching Vector Store...")
    print(f"Query: '{test_query}'")
    print(f"Strict Filter SN: {target_serial_number}\n")
    
    # Perform the search
    results = provider.retrieve_context(
        query_text=test_query, 
        serial_number=target_serial_number
    )
    
    if not results:
        print("❌ No results found. The query might not match the manual, or the SN is wrong.")
        return
        
    print(f"✅ Found {len(results)} relevant chunks!\n")
    
    # Format them exactly as they will appear to the LLM
    formatted_prompt_block = provider.format_system_prompt_block(results)
    print(formatted_prompt_block)

if __name__ == "__main__":
    test_retrieval()