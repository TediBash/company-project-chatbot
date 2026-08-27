# app/rag/ingestion.py
import re
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
        Extracts and chunks a PDF document into vector-ready documents.
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

    def chunk_markdown_document(self, file_path: str | Path, extra_metadata: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """
        Extracts and chunks an OCR-generated TXT/Markdown manual.
        Uses Semantic Splitting to keep procedures intact and tracks pages dynamically.
        """
        file_path_obj = Path(file_path)
        filename = file_path_obj.name
        
        with open(file_path_obj, 'r', encoding='utf-8') as f:
            lines = f.readlines()

        chunks = []
        current_page = "1"
        current_section = "General Information"
        current_text = []
        chunk_idx = 0

        page_pattern = re.compile(r'\(Page\s+([A-Za-z0-9]+)\)', re.IGNORECASE)
        header_pattern = re.compile(r'^(#{1,3})\s+(.+)$')

        for line in lines:
            line_stripped = line.strip()
            if not line_stripped:
                current_text.append("")
                continue

            # Update the page number if detected
            page_match = page_pattern.search(line_stripped)
            if page_match:
                current_page = page_match.group(1)

            # Detect Markdown headers to split chunks
            header_match = header_pattern.match(line_stripped)
            if header_match:
                level = len(header_match.group(1))
                heading_text = header_match.group(2).strip()
                clean_section_title = page_pattern.sub('', heading_text).strip()

                if level <= 2: 
                    joined_text = "\n".join(current_text).strip()
                    if joined_text:
                        metadata = {
                            "source": filename,
                            "section": current_section,
                            "page": current_page,
                            "chunk_id": chunk_idx
                        }
                        if extra_metadata:
                            metadata.update(extra_metadata)

                        chunks.append({
                            "id": f"{filename}_p{current_page}_c{chunk_idx}",
                            "text": joined_text,
                            "metadata": metadata,
                        })
                        chunk_idx += 1
                        
                    current_text = []
                    current_section = clean_section_title

            current_text.append(line_stripped)

        # Append the final chunk
        final_text = "\n".join(current_text).strip()
        if final_text:
            metadata = {
                "source": filename,
                "section": current_section,
                "page": current_page,
                "chunk_id": chunk_idx
            }
            if extra_metadata:
                metadata.update(extra_metadata)

            chunks.append({
                "id": f"{filename}_p{current_page}_c{chunk_idx}",
                "text": final_text,
                "metadata": metadata,
            })

        return chunks