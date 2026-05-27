import re
import fitz  # PyMuPDF
import docx
from typing import List, Dict, Any
from config import get_settings

settings = get_settings()


def extract_text_from_pdf(file_bytes: bytes) -> List[Dict[str, Any]]:
    """Extract text from PDF with page tracking."""
    pages = []
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    for page_num in range(len(doc)):
        page = doc[page_num]
        text = page.get_text("text")
        if text.strip():
            pages.append({"page": page_num + 1, "text": text.strip()})
    doc.close()
    return pages


def extract_text_from_docx(file_bytes: bytes) -> List[Dict[str, Any]]:
    """Extract text from DOCX."""
    import io
    document = docx.Document(io.BytesIO(file_bytes))
    full_text = "\n".join([para.text for para in document.paragraphs if para.text.strip()])
    return [{"page": 1, "text": full_text}]


def extract_text_from_txt(file_bytes: bytes) -> List[Dict[str, Any]]:
    """Extract text from TXT."""
    text = file_bytes.decode("utf-8", errors="ignore")
    return [{"page": 1, "text": text}]


def extract_text(file_bytes: bytes, file_type: str) -> str:
    """Main extraction dispatcher."""
    ft = file_type.lower().strip(".")
    if ft == "pdf":
        pages = extract_text_from_pdf(file_bytes)
    elif ft in ("docx", "doc"):
        pages = extract_text_from_docx(file_bytes)
    else:
        pages = extract_text_from_txt(file_bytes)
    return "\n\n".join([p["text"] for p in pages])


def detect_document_type(text: str) -> str:
    """Detect Indian legal document type for smart chunking."""
    text_lower = text.lower()
    if any(kw in text_lower for kw in ["first information report", "f.i.r", "police station", "station diary"]):
        return "fir"
    if any(kw in text_lower for kw in ["whereas", "petition", "petitioner", "respondent", "writ"]):
        return "petition"
    if any(kw in text_lower for kw in ["article ", "part ", "schedule ", "constitution of india"]):
        return "constitution"
    if any(kw in text_lower for kw in ["section ", "act,", "ipc", "crpc", "indian penal"]):
        return "act"
    if any(kw in text_lower for kw in ["judgment", "judgement", "order", "hon'ble", "coram", "bench"]):
        return "judgment"
    if any(kw in text_lower for kw in ["affidavit", "deponent", "sworn", "solemnly affirm"]):
        return "affidavit"
    return "general"


def smart_chunk(text: str, filename: str, doc_id: str) -> List[Dict[str, Any]]:
    """
    Structure-aware chunking for Indian legal documents.
    Returns list of chunk dicts with text + metadata.
    """
    doc_type = detect_document_type(text)
    chunks = []

    if doc_type == "act":
        # Split by sections
        raw = re.split(r'\n(?=\d+\.\s+[A-Z])', text)
        if len(raw) < 3:
            raw = re.split(r'\nSection\s+\d+', text, flags=re.IGNORECASE)
        for i, segment in enumerate(raw):
            segment = segment.strip()
            if len(segment) > 100:
                chunks.append({
                    "text": segment,
                    "doc_id": doc_id,
                    "filename": filename,
                    "doc_type": doc_type,
                    "chunk_index": i,
                    "section": _extract_section_title(segment),
                })

    elif doc_type == "constitution":
        raw = re.split(r'\n(?=Article\s+\d+)', text, flags=re.IGNORECASE)
        for i, segment in enumerate(raw):
            segment = segment.strip()
            if len(segment) > 100:
                chunks.append({
                    "text": segment,
                    "doc_id": doc_id,
                    "filename": filename,
                    "doc_type": doc_type,
                    "chunk_index": i,
                    "section": _extract_section_title(segment),
                })

    elif doc_type == "judgment":
        # Split by headings typical in judgments
        raw = re.split(r'\n(?=[A-Z][A-Z\s]{5,}:?\n)', text)
        for i, segment in enumerate(raw):
            segment = segment.strip()
            if len(segment) > 150:
                chunks.append({
                    "text": segment,
                    "doc_id": doc_id,
                    "filename": filename,
                    "doc_type": doc_type,
                    "chunk_index": i,
                    "section": "",
                })

    else:
        # Fallback: sliding window paragraph chunking
        chunks = _sliding_window_chunk(text, doc_id, filename, doc_type)

    # If any chunk is too large, sub-chunk it
    final_chunks = []
    for chunk in chunks:
        if len(chunk["text"]) > settings.chunk_size * 4:
            sub = _sliding_window_chunk(chunk["text"], doc_id, filename, doc_type)
            for j, s in enumerate(sub):
                s["chunk_index"] = chunk["chunk_index"] * 100 + j
                final_chunks.append(s)
        else:
            final_chunks.append(chunk)

    return final_chunks


def _sliding_window_chunk(text: str, doc_id: str, filename: str, doc_type: str) -> List[Dict]:
    """Sliding window chunking with overlap."""
    words = text.split()
    chunk_size = settings.chunk_size
    overlap = settings.chunk_overlap
    chunks = []
    i = 0
    idx = 0
    while i < len(words):
        chunk_words = words[i:i + chunk_size]
        chunk_text = " ".join(chunk_words).strip()
        if len(chunk_text) > 80:
            chunks.append({
                "text": chunk_text,
                "doc_id": doc_id,
                "filename": filename,
                "doc_type": doc_type,
                "chunk_index": idx,
                "section": "",
            })
        i += chunk_size - overlap
        idx += 1
    return chunks


def _extract_section_title(text: str) -> str:
    """Extract section/article title from text."""
    lines = text.strip().split("\n")
    for line in lines[:3]:
        line = line.strip()
        if len(line) > 5 and len(line) < 120:
            return line
    return ""
