import os
import json
import asyncio
import aiofiles
import logging
from contextlib import asynccontextmanager
from typing import List, Optional, Dict, Any

from fastapi import (
    FastAPI, UploadFile, File, HTTPException, Depends,
    BackgroundTasks, Query, Form
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from config import get_settings
from db.models import create_tables, get_db, Workspace, Document, Message, User, generate_id
from rag.document_parser import extract_text, smart_chunk
from rag.vector_store import embed_and_store, semantic_search, get_collection_stats, delete_document_chunks
from services.kanoon import search_precedents
from services.groq_service import (
    stream_completion, LEGAL_SYSTEM_PROMPT,
    build_rag_prompt, build_draft_prompt,
)
from agents.legal_agents import (
    stream_counter_arguments, stream_verdict_prediction,
    stream_draft_document, stream_legal_search,
)
from agents.report_builder import generate_legal_brief

settings = get_settings()
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting LexAI backend...")
    os.makedirs(settings.chroma_persist_dir, exist_ok=True)
    os.makedirs("./data/uploads", exist_ok=True)
    # create_tables()  # Uncomment when Supabase is configured
    yield
    logger.info("Shutting down LexAI backend...")


app = FastAPI(
    title="LexAI API",
    description="Indian Legal AI Assistant Backend",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Pydantic Models ──────────────────────────────────────────────────────────

class WorkspaceCreate(BaseModel):
    name: str
    description: Optional[str] = None
    case_type: Optional[str] = "general"
    user_id: str

class WorkspaceOut(BaseModel):
    id: str
    name: str
    description: Optional[str]
    case_type: Optional[str]
    status: str
    created_at: str
    document_count: int = 0
    chunk_count: int = 0

class ChatRequest(BaseModel):
    workspace_id: str
    message: str
    conversation_history: Optional[List[Dict[str, str]]] = []
    mode: Optional[str] = "chat"  # chat | search | counter_args | verdict | draft

class CounterArgRequest(BaseModel):
    workspace_id: str
    petition_text: Optional[str] = None
    doc_id: Optional[str] = None

class VerdictRequest(BaseModel):
    workspace_id: str
    case_facts: str

class DraftRequest(BaseModel):
    doc_type: str
    details: Dict[str, str]
    workspace_id: Optional[str] = None

class SearchRequest(BaseModel):
    workspace_id: str
    query: str

class ReportRequest(BaseModel):
    workspace_id: str
    case_facts: Optional[str] = ""
    prosecution_args: Optional[str] = ""
    defense_args: Optional[str] = ""
    verdict_analysis: Optional[str] = ""
    citations: Optional[List[Dict]] = []
    probability: Optional[Dict] = None


# ─── Health Check ─────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model": settings.model_name,
        "groq_configured": bool(settings.groq_api_key),
        "kanoon_configured": bool(settings.indian_kanoon_api_key),
        "version": "1.0.0",
    }


# ─── Workspace Endpoints ──────────────────────────────────────────────────────

@app.post("/workspaces")
async def create_workspace(payload: WorkspaceCreate):
    workspace_id = generate_id()
    # In production: save to Supabase/PostgreSQL
    return {
        "id": workspace_id,
        "name": payload.name,
        "description": payload.description,
        "case_type": payload.case_type,
        "status": "active",
        "created_at": "2024-01-01T00:00:00Z",
        "document_count": 0,
        "chunk_count": 0,
    }


@app.get("/workspaces/{workspace_id}/stats")
async def workspace_stats(workspace_id: str):
    stats = get_collection_stats(workspace_id)
    return stats


# ─── Document Upload Pipeline ─────────────────────────────────────────────────

async def _process_document(
    workspace_id: str,
    doc_id: str,
    filename: str,
    file_type: str,
    file_bytes: bytes,
):
    """Background task: extract → chunk → embed → store."""
    try:
        logger.info(f"Processing document: {filename} for workspace {workspace_id}")

        # 1. Extract text
        text = extract_text(file_bytes, file_type)
        if not text.strip():
            logger.warning(f"No text extracted from {filename}")
            return

        # 2. Smart chunk
        chunks = smart_chunk(text, filename, doc_id)
        logger.info(f"Created {len(chunks)} chunks from {filename}")

        # 3. Embed + store in ChromaDB
        count = embed_and_store(workspace_id, chunks, doc_id)
        logger.info(f"Stored {count} embeddings for {filename}")

    except Exception as e:
        logger.error(f"Error processing {filename}: {e}")


@app.post("/workspaces/{workspace_id}/upload")
async def upload_documents(
    workspace_id: str,
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
):
    """
    Upload one or more legal documents to a workspace.
    Text extraction + chunking + embedding runs in background.
    """
    results = []

    for file in files:
        if not file.filename:
            continue

        # Validate file type
        allowed = {"pdf", "docx", "doc", "txt"}
        ext = file.filename.rsplit(".", 1)[-1].lower()
        if ext not in allowed:
            results.append({"filename": file.filename, "status": "error", "message": f"File type .{ext} not supported"})
            continue

        file_bytes = await file.read()
        doc_id = generate_id()

        # Schedule background processing
        background_tasks.add_task(
            _process_document,
            workspace_id=workspace_id,
            doc_id=doc_id,
            filename=file.filename,
            file_type=ext,
            file_bytes=file_bytes,
        )

        results.append({
            "doc_id": doc_id,
            "filename": file.filename,
            "size": len(file_bytes),
            "status": "processing",
            "message": "Document queued for AI indexing",
        })

    return {"uploaded": len(results), "documents": results}


@app.get("/workspaces/{workspace_id}/documents")
async def list_documents(workspace_id: str):
    """List documents with their indexing status."""
    stats = get_collection_stats(workspace_id)
    return {
        "workspace_id": workspace_id,
        "chunk_count": stats["chunk_count"],
        "ready": stats["chunk_count"] > 0,
    }


@app.delete("/workspaces/{workspace_id}/documents/{doc_id}")
async def delete_document(workspace_id: str, doc_id: str):
    deleted = delete_document_chunks(workspace_id, doc_id)
    return {"deleted_chunks": deleted, "doc_id": doc_id}


# ─── AI Chat (RAG Pipeline) ───────────────────────────────────────────────────

@app.post("/chat/stream")
async def chat_stream(payload: ChatRequest):
    """
    Main AI chat endpoint with SSE streaming.
    Full RAG pipeline: ChromaDB + Indian Kanoon + Groq.
    """

    async def generate():
        try:
            # Stage 1
            yield "data: " + json.dumps({"stage": "Analyzing your documents...", "type": "stage"}) + "\n\n"

            doc_chunks = semantic_search(
                payload.workspace_id,
                payload.message,
                top_k=settings.top_k_chunks,
            )

            # Stage 2
            yield "data: " + json.dumps({"stage": "Searching Indian legal precedents...", "type": "stage"}) + "\n\n"

            kanoon_results = await search_precedents(payload.message, num_results=4)

            # Stage 3
            yield "data: " + json.dumps({"stage": "Building legal reasoning...", "type": "stage"}) + "\n\n"

            messages = build_rag_prompt(
                query=payload.message,
                doc_chunks=doc_chunks,
                kanoon_results=kanoon_results,
                conversation_history=payload.conversation_history,
            )

            # Stage 4: stream tokens
            yield "data: " + json.dumps({"stage": "Generating response...", "type": "stage"}) + "\n\n"
            yield "data: " + json.dumps({"type": "start"}) + "\n\n"

            async for token in stream_completion(
                messages=messages,
                system_prompt=LEGAL_SYSTEM_PROMPT,
                temperature=0.3,
                max_tokens=2048,
            ):
                yield "data: " + json.dumps({"token": token, "type": "token"}) + "\n\n"

            # Send citations
            citations = [
                {
                    "title": r["title"],
                    "court": r["court"],
                    "date": r["date"],
                    "url": r["url"],
                    "citation": r["citation"],
                    "snippet": r["snippet"][:150],
                    "type": "kanoon",
                }
                for r in kanoon_results
            ]
            doc_citations = [
                {
                    "title": c["filename"],
                    "section": c.get("section", ""),
                    "score": c["relevance_score"],
                    "type": "document",
                }
                for c in doc_chunks[:4]
            ]
            yield "data: " + json.dumps({"citations": citations + doc_citations, "type": "citations"}) + "\n\n"
            yield "data: " + json.dumps({"type": "done"}) + "\n\n"

        except Exception as e:
            logger.error(f"Chat stream error: {e}")
            yield "data: " + json.dumps({"error": str(e), "type": "error"}) + "\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    })


# ─── Counter Argument Generator ───────────────────────────────────────────────

@app.post("/counter-arguments/stream")
async def counter_arguments_stream(payload: CounterArgRequest):
    petition_text = payload.petition_text or ""

    if not petition_text and payload.doc_id:
        # Retrieve from ChromaDB if no text provided
        chunks = semantic_search(payload.workspace_id, "main arguments claims", top_k=8)
        petition_text = "\n\n".join([c["text"] for c in chunks])

    if not petition_text:
        raise HTTPException(status_code=400, detail="Provide petition_text or doc_id")

    return StreamingResponse(
        stream_counter_arguments(payload.workspace_id, petition_text),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─── Verdict Predictor ────────────────────────────────────────────────────────

@app.post("/verdict/stream")
async def verdict_stream(payload: VerdictRequest):
    return StreamingResponse(
        stream_verdict_prediction(payload.workspace_id, payload.case_facts),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─── AI Document Drafter ──────────────────────────────────────────────────────

@app.post("/draft/stream")
async def draft_stream(payload: DraftRequest):
    return StreamingResponse(
        stream_draft_document(payload.doc_type, payload.details, payload.workspace_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─── Legal Search ─────────────────────────────────────────────────────────────

@app.post("/search/stream")
async def search_stream(payload: SearchRequest):
    return StreamingResponse(
        stream_legal_search(payload.workspace_id, payload.query),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/search/kanoon")
async def kanoon_search(q: str = Query(...), limit: int = Query(default=5)):
    results = await search_precedents(q, num_results=limit)
    return {"query": q, "results": results}


# ─── Report Builder (DOCX) ────────────────────────────────────────────────────

@app.post("/report/generate")
async def generate_report(payload: ReportRequest):
    """Generate a downloadable DOCX legal brief."""
    try:
        # Get workspace name
        workspace_name = f"Case {payload.workspace_id[:8]}"

        docx_bytes = generate_legal_brief(
            workspace_name=workspace_name,
            case_facts=payload.case_facts,
            prosecution_args=payload.prosecution_args,
            defense_args=payload.defense_args,
            verdict_analysis=payload.verdict_analysis,
            citations=payload.citations,
            probability=payload.probability,
        )

        return Response(
            content=docx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f"attachment; filename=LexAI_Brief_{payload.workspace_id[:8]}.docx"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=settings.port, reload=True)
