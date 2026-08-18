# app/rag/ingestion.py
from pathlib import Path
from typing import List, Dict, Any, Optional
import pymupdf as fitz
from langchain_text_splitters import RecursiveCharacterTextSplitter


class DocumentIngestionEngine:
    """
    Independent engine for extracting and chunking technical documents.
    """

    def __init__(
        self,
        chunk_size: int = 600,
        chunk_overlap: int = 100,
        separators: Optional[List[str]] = None,
    ):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap,
            separators=separators or ["\n\n", "\n", ". ", " ", ""],
        )

    def extract_text_from_pdf(self, file_path: str | Path) -> List[Dict[str, Any]]:
        """
        Reads a PDF file page by page using PyMuPDF.
        Returns a list of pages with metadata.
        """
        pdf_path = Path(file_path)
        if not pdf_path.exists():
            raise FileNotFoundError(f"PDF file not found at: {pdf_path}")

        pages_data = []
        doc = fitz.open(pdf_path)

        for page_num in range(len(doc)):
            page = doc[page_num]
            text = page.get_text("text").strip()
            if text:
                pages_data.append({
                    "text": text,
                    "page_number": page_num + 1,
                    "total_pages": len(doc),
                    "source": pdf_path.name,
                })

        doc.close()
        return pages_data

    def chunk_document(self, file_path: str | Path, extra_metadata: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """
        Extracts and chunks an entire document into vector-ready documents.
        """
        pages = self.extract_text_from_pdf(file_path)
        chunks = []
        chunk_idx = 0

        for page in pages:
            split_texts = self.splitter.split_text(page["text"])
            for text_chunk in split_texts:
                metadata = {
                    "source": page["source"],
                    "page": page["page_number"],
                    "chunk_id": chunk_idx,
                }
                if extra_metadata:
                    metadata.update(extra_metadata)

                chunks.append({
                    "id": f"{page['source']}_p{page['page_number']}_c{chunk_idx}",
                    "text": text_chunk,
                    "metadata": metadata,
                })
                chunk_idx += 1

        return chunks