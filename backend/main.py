import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Dict, List, Optional

import aiofiles
import requests
from fastapi import BackgroundTasks, Depends, FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from agents.legal_agents import (
    stream_counter_arguments,
    stream_draft_document,
    stream_legal_search,
    stream_verdict_prediction,
)
from agents.report_builder import generate_legal_brief
from config import get_settings
from db.models import (
    ChatThread,
    Document,
    GeneratedDocument,
    Message,
    SearchHistory,
    User,
    VerdictAnalysis,
    Workspace,
    create_tables,
    generate_id,
    get_db,
)
from rag.document_parser import extract_text, smart_chunk
from rag.vector_store import (
    delete_document_chunks,
    delete_workspace_collection,
    embed_and_store,
    get_collection_stats,
    semantic_search,
)
from services.groq_service import LEGAL_SYSTEM_PROMPT, build_rag_prompt, stream_completion
from services.kanoon import search_precedents

settings = get_settings()
logger = logging.getLogger("lexai.api")
logging.basicConfig(level=logging.INFO)
create_tables()

security = HTTPBearer(auto_error=False)


class UserCreate(BaseModel):
    email: str
    name: str
    avatar_url: Optional[str] = None
    supabase_uid: Optional[str] = None


class WorkspaceCreate(BaseModel):
    name: str
    description: Optional[str] = None
    case_type: Optional[str] = "general"


class WorkspaceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    case_type: Optional[str] = None
    status: Optional[str] = None


class ChatThreadCreate(BaseModel):
    title: Optional[str] = "New Chat"


class ChatThreadUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None


class ChatRequest(BaseModel):
    workspace_id: str
    message: str
    conversation_history: List[Dict[str, str]] = Field(default_factory=list)
    mode: str = "chat"
    chat_id: Optional[str] = None


class CounterArgRequest(BaseModel):
    workspace_id: str
    petition_text: Optional[str] = None
    doc_id: Optional[str] = None
    chat_id: Optional[str] = None


class VerdictRequest(BaseModel):
    workspace_id: str
    case_facts: str
    chat_id: Optional[str] = None


class DraftRequest(BaseModel):
    doc_type: str
    details: Dict[str, str]
    workspace_id: Optional[str] = None
    chat_id: Optional[str] = None


class SearchRequest(BaseModel):
    workspace_id: str
    query: str
    chat_id: Optional[str] = None


class ReportRequest(BaseModel):
    workspace_id: str
    case_facts: Optional[str] = ""
    prosecution_args: Optional[str] = ""
    defense_args: Optional[str] = ""
    verdict_analysis: Optional[str] = ""
    citations: List[Dict[str, Any]] = Field(default_factory=list)
    probability: Optional[Dict[str, Any]] = None


def _iso(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    return value.isoformat()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _title_from_text(text: str, fallback: str = "New Chat") -> str:
    cleaned = " ".join((text or "").strip().split())
    if not cleaned:
        return fallback
    return cleaned[:90]


def _sse_to_event(chunk: str) -> Optional[Dict[str, Any]]:
    if not chunk:
        return None
    for line in chunk.splitlines():
        if line.startswith("data: "):
            raw = line[len("data: ") :].strip()
            if not raw:
                continue
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                return None
    return None


def _message_chat_id(message: Message) -> Optional[str]:
    if getattr(message, "chat_id", None):
        return str(message.chat_id)
    meta = message.metadata_ if isinstance(message.metadata_, dict) else {}
    return meta.get("chat_id")


def _serialize_message(message: Message) -> Dict[str, Any]:
    meta = message.metadata_ if isinstance(message.metadata_, dict) else {}
    return {
        "id": str(message.id),
        "role": message.role,
        "content": message.content,
        "message_type": message.message_type,
        "chat_id": str(message.chat_id) if message.chat_id else meta.get("chat_id"),
        "citations": message.citations or [],
        "created_at": _iso(message.created_at),
    }


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> Dict[str, Any]:
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Missing authentication")

    token = credentials.credentials
    if not settings.supabase_url:
        raise HTTPException(status_code=500, detail="Supabase URL not configured")

    api_key = settings.supabase_key or settings.supabase_service_key
    if not api_key:
        raise HTTPException(status_code=500, detail="Supabase API key not configured")

    try:
        response = requests.get(
            f"{settings.supabase_url}/auth/v1/user",
            headers={"Authorization": f"Bearer {token}", "apikey": api_key},
            timeout=15,
        )
    except Exception as exc:
        logger.error("Supabase auth network error: %s", exc)
        raise HTTPException(status_code=401, detail="Authentication failed")

    if response.status_code != 200:
        logger.error("Supabase auth failed: %s - %s", response.status_code, response.text)
        raise HTTPException(status_code=401, detail="Invalid authentication")

    user = response.json()
    return {
        "sub": user.get("id"),
        "email": user.get("email"),
        "user_metadata": user.get("user_metadata", {}),
        "app_metadata": user.get("app_metadata", {}),
    }


def _ensure_db_user(current_user: Dict[str, Any], db: Session) -> User:
    supabase_uid = current_user.get("sub")
    if not supabase_uid:
        raise HTTPException(status_code=401, detail="Invalid authentication payload")

    email = current_user.get("email") or f"{supabase_uid}@lexai.local"
    metadata = current_user.get("user_metadata", {}) or {}
    name = metadata.get("full_name") or metadata.get("name") or email.split("@")[0]
    avatar_url = metadata.get("avatar_url")

    user = db.query(User).filter(User.supabase_uid == supabase_uid).first()
    if not user:
        user = db.query(User).filter(User.email == email).first()

    if not user:
        user = User(
            id=generate_id(),
            email=email,
            name=name,
            avatar_url=avatar_url,
            supabase_uid=supabase_uid,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    changed = False
    if not user.supabase_uid:
        user.supabase_uid = supabase_uid
        changed = True
    if name and user.name != name:
        user.name = name
        changed = True
    if avatar_url and user.avatar_url != avatar_url:
        user.avatar_url = avatar_url
        changed = True
    if changed:
        db.commit()
        db.refresh(user)

    return user


def _owner_ids(user: User, current_user: Dict[str, Any]) -> List[str]:
    values = {str(user.id), str(current_user.get("sub") or "")}
    if user.supabase_uid:
        values.add(str(user.supabase_uid))
    return [value for value in values if value]


def verify_workspace_access(workspace_id: str, current_user: Dict[str, Any], db: Session) -> Workspace:
    db_user = _ensure_db_user(current_user, db)
    owners = _owner_ids(db_user, current_user)
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id, Workspace.user_id.in_(owners)).first()
    if not workspace:
        raise HTTPException(status_code=403, detail="Access denied to workspace")

    if workspace.user_id != db_user.id:
        workspace.user_id = db_user.id
        db.commit()
        db.refresh(workspace)

    return workspace


def _serialize_workspace(workspace: Workspace, db: Session) -> Dict[str, Any]:
    doc_agg = (
        db.query(func.count(Document.id), func.coalesce(func.sum(Document.chunk_count), 0))
        .filter(Document.workspace_id == workspace.id)
        .first()
    )
    message_count = db.query(func.count(Message.id)).filter(Message.workspace_id == workspace.id).scalar() or 0
    chat_count = db.query(func.count(ChatThread.id)).filter(ChatThread.workspace_id == workspace.id).scalar() or 0
    return {
        "id": str(workspace.id),
        "name": workspace.name,
        "description": workspace.description,
        "case_type": workspace.case_type,
        "status": workspace.status,
        "created_at": _iso(workspace.created_at),
        "document_count": int(doc_agg[0] or 0),
        "chunk_count": int(doc_agg[1] or 0),
        "message_count": int(message_count),
        "chat_count": int(chat_count),
    }


def _get_chat_thread(db: Session, workspace_id: str, chat_id: Optional[str], fallback_title: str) -> ChatThread:
    if chat_id:
        chat = (
            db.query(ChatThread)
            .filter(ChatThread.id == chat_id, ChatThread.workspace_id == workspace_id, ChatThread.status == "active")
            .first()
        )
        if not chat:
            raise HTTPException(status_code=404, detail="Chat thread not found")
        return chat

    chat = (
        db.query(ChatThread)
        .filter(ChatThread.workspace_id == workspace_id, ChatThread.status == "active")
        .order_by(ChatThread.last_message_at.desc(), ChatThread.created_at.desc())
        .first()
    )
    if chat:
        return chat

    chat = ChatThread(workspace_id=workspace_id, title=_title_from_text(fallback_title))
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return chat


def _backfill_chat_ids_for_workspace(db: Session, workspace_id: str) -> None:
    missing = (
        db.query(Message)
        .filter(Message.workspace_id == workspace_id, Message.chat_id.is_(None))
        .order_by(Message.created_at.asc())
        .limit(4000)
        .all()
    )
    if not missing:
        return

    thread = (
        db.query(ChatThread)
        .filter(ChatThread.workspace_id == workspace_id, ChatThread.status == "active")
        .order_by(ChatThread.last_message_at.desc(), ChatThread.created_at.asc())
        .first()
    )
    if not thread:
        thread = ChatThread(workspace_id=workspace_id, title="New Chat")
        db.add(thread)
        db.commit()
        db.refresh(thread)

    active_thread_ids = {
        str(thread_id)
        for (thread_id,) in db.query(ChatThread.id)
        .filter(ChatThread.workspace_id == workspace_id, ChatThread.status == "active")
        .all()
    }
    if str(thread.id) not in active_thread_ids:
        active_thread_ids.add(str(thread.id))

    changed = False
    for message in missing:
        meta = message.metadata_ if isinstance(message.metadata_, dict) else {}
        candidate = meta.get("chat_id") or str(thread.id)
        if candidate not in active_thread_ids:
            candidate = str(thread.id)
        message.chat_id = candidate
        meta["chat_id"] = candidate
        message.metadata_ = meta
        changed = True

    if changed:
        db.commit()


async def _process_document(workspace_id: str, doc_id: str, filename: str, file_type: str, file_bytes: bytes) -> None:
    db = next(get_db())
    try:
        upload_dir = "./data/uploads"
        os.makedirs(upload_dir, exist_ok=True)
        filepath = os.path.join(upload_dir, f"{doc_id}_{filename}")
        async with aiofiles.open(filepath, "wb") as file_handle:
            await file_handle.write(file_bytes)

        text = extract_text(file_bytes, file_type)
        if not text.strip():
            raise ValueError("No text extracted from document")

        chunks = smart_chunk(text, filename, doc_id)
        chunk_count = embed_and_store(workspace_id, chunks, doc_id)

        document = db.query(Document).filter(Document.id == doc_id).first()
        if document:
            document.status = "ready"
            document.chunk_count = int(chunk_count)
            document.storage_path = filepath
            document.error_message = None
            db.commit()
    except Exception as exc:
        logger.exception("Document processing error for %s: %s", filename, exc)
        document = db.query(Document).filter(Document.id == doc_id).first()
        if document:
            document.status = "failed"
            document.error_message = str(exc)
            db.commit()
    finally:
        db.close()


async def _persist_stream_response(
    *,
    workspace_id: str,
    chat_id: Optional[str],
    message_type: str,
    user_text: str,
    stream: AsyncGenerator[str, None],
    db: Session,
) -> AsyncGenerator[str, None]:
    metadata = {"chat_id": chat_id} if chat_id else {}
    user_message = Message(
        workspace_id=workspace_id,
        chat_id=chat_id,
        role="user",
        content=user_text,
        message_type=message_type,
        metadata_=metadata,
    )
    db.add(user_message)
    db.commit()

    assistant_text = ""
    citations: List[Dict[str, Any]] = []
    extra_metadata: Dict[str, Any] = {"chat_id": chat_id} if chat_id else {}

    try:
        async for chunk in stream:
            event = _sse_to_event(chunk)
            if event:
                if event.get("type") == "token":
                    assistant_text += event.get("token", "")
                elif event.get("type") == "citations" and isinstance(event.get("citations"), list):
                    citations = event.get("citations") or []
                elif event.get("type") == "probability":
                    extra_metadata["probability"] = event.get("probability")
            yield chunk

        assistant_message = Message(
            workspace_id=workspace_id,
            chat_id=chat_id,
            role="assistant",
            content=assistant_text.strip() or "No response generated.",
            message_type=message_type,
            citations=citations,
            metadata_=extra_metadata,
        )
        db.add(assistant_message)
        if chat_id:
            chat = db.query(ChatThread).filter(ChatThread.id == chat_id).first()
            if chat:
                chat.last_message_at = _now()
        db.commit()
    except Exception as exc:
        logger.exception("Stream persistence error (%s): %s", message_type, exc)
        yield "data: " + json.dumps({"type": "error", "error": str(exc)}) + "\n\n"


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting LexAI backend")
    os.makedirs(settings.chroma_persist_dir, exist_ok=True)
    os.makedirs("./data/uploads", exist_ok=True)
    yield
    logger.info("Stopping LexAI backend")


app = FastAPI(
    title="LexAI API",
    description="Indian Legal AI Assistant Backend",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(Exception)
async def generic_exception_handler(_: Request, exc: Exception):
    logger.exception("Unhandled backend error: %s", exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/health")
async def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "model": settings.model_name,
        "groq_configured": bool(settings.groq_api_key),
        "kanoon_configured": bool(settings.indian_kanoon_api_key),
        "supabase_configured": bool(settings.supabase_url),
        "version": "2.0.0",
    }


@app.post("/users")
async def create_user(payload: UserCreate, db: Session = Depends(get_db)) -> Dict[str, Any]:
    user = db.query(User).filter(User.email == payload.email).first()
    if user:
        if payload.supabase_uid and not user.supabase_uid:
            user.supabase_uid = payload.supabase_uid
            db.commit()
            db.refresh(user)
        return {"id": str(user.id), "email": user.email, "name": user.name}

    user = User(
        id=generate_id(),
        email=payload.email,
        name=payload.name,
        avatar_url=payload.avatar_url,
        supabase_uid=payload.supabase_uid,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"id": str(user.id), "email": user.email, "name": user.name}


@app.post("/workspaces")
async def create_workspace(
    payload: WorkspaceCreate,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    db_user = _ensure_db_user(current_user, db)
    name = payload.name.strip()
    if len(name) < 3:
        raise HTTPException(status_code=422, detail="Workspace name must be at least 3 characters")

    workspace = Workspace(
        user_id=db_user.id,
        name=name,
        description=(payload.description or "").strip() or None,
        case_type=payload.case_type or "general",
    )
    db.add(workspace)
    db.commit()
    db.refresh(workspace)

    thread = ChatThread(workspace_id=workspace.id, title="New Chat")
    db.add(thread)
    db.commit()

    return _serialize_workspace(workspace, db)


@app.get("/workspaces")
async def list_workspaces(
    q: Optional[str] = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=500),
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    db_user = _ensure_db_user(current_user, db)
    owners = _owner_ids(db_user, current_user)

    query = db.query(Workspace).filter(Workspace.user_id.in_(owners))
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(Workspace.name.ilike(like))

    workspaces = query.order_by(Workspace.created_at.desc()).offset(offset).limit(limit).all()

    response: List[Dict[str, Any]] = []
    for workspace in workspaces:
        if workspace.user_id != db_user.id:
            workspace.user_id = db_user.id
            db.commit()
            db.refresh(workspace)
        response.append(_serialize_workspace(workspace, db))
    return response


@app.patch("/workspaces/{workspace_id}")
async def update_workspace(
    workspace_id: str,
    payload: WorkspaceUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    workspace = verify_workspace_access(workspace_id, current_user, db)
    if payload.name is not None:
        name = payload.name.strip()
        if len(name) < 3:
            raise HTTPException(status_code=422, detail="Workspace name must be at least 3 characters")
        workspace.name = name
    if payload.description is not None:
        workspace.description = payload.description.strip() or None
    if payload.case_type is not None:
        workspace.case_type = payload.case_type
    if payload.status is not None:
        workspace.status = payload.status
    workspace.updated_at = _now()
    db.commit()
    db.refresh(workspace)
    return _serialize_workspace(workspace, db)


@app.delete("/workspaces/{workspace_id}")
async def remove_workspace(
    workspace_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    workspace = verify_workspace_access(workspace_id, current_user, db)
    counts = {
        "messages": db.query(func.count(Message.id)).filter(Message.workspace_id == workspace.id).scalar() or 0,
        "documents": db.query(func.count(Document.id)).filter(Document.workspace_id == workspace.id).scalar() or 0,
        "chats": db.query(func.count(ChatThread.id)).filter(ChatThread.workspace_id == workspace.id).scalar() or 0,
        "search_history": db.query(func.count(SearchHistory.id)).filter(SearchHistory.workspace_id == workspace.id).scalar()
        or 0,
        "verdict_analyses": db.query(func.count(VerdictAnalysis.id))
        .filter(VerdictAnalysis.workspace_id == workspace.id)
        .scalar()
        or 0,
        "generated_documents": db.query(func.count(GeneratedDocument.id))
        .filter(GeneratedDocument.workspace_id == workspace.id)
        .scalar()
        or 0,
    }
    db.delete(workspace)
    db.commit()
    try:
        delete_workspace_collection(str(workspace_id))
    except Exception:
        logger.warning("Workspace collection cleanup failed for %s", workspace_id)
    return {"ok": True, "workspace_id": workspace_id, "deleted": counts}


@app.get("/workspaces/{workspace_id}/stats")
async def get_workspace_stats(
    workspace_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    workspace = verify_workspace_access(workspace_id, current_user, db)
    _backfill_chat_ids_for_workspace(db, str(workspace.id))

    docs = (
        db.query(Document)
        .filter(Document.workspace_id == workspace.id)
        .order_by(Document.created_at.desc())
        .limit(400)
        .all()
    )
    messages = (
        db.query(Message)
        .filter(Message.workspace_id == workspace.id)
        .order_by(Message.created_at.desc())
        .limit(1200)
        .all()
    )
    threads = (
        db.query(ChatThread)
        .filter(ChatThread.workspace_id == workspace.id, ChatThread.status == "active")
        .order_by(ChatThread.last_message_at.desc(), ChatThread.created_at.desc())
        .limit(200)
        .all()
    )

    messages_by_chat: Dict[str, List[Message]] = {}
    for message in messages:
        key = _message_chat_id(message) or "default"
        messages_by_chat.setdefault(key, []).append(message)

    recent_chats = []
    for thread in threads[:12]:
        thread_messages = messages_by_chat.get(str(thread.id), [])
        last = thread_messages[0] if thread_messages else None
        recent_chats.append(
            {
                "id": str(thread.id),
                "title": thread.title,
                "message_count": len(thread_messages),
                "last_message": last.content[:160] if last else "",
                "updated_at": _iso(thread.last_message_at or thread.updated_at or thread.created_at),
            }
        )

    recent_activity: List[Dict[str, Any]] = []
    for doc in docs[:12]:
        recent_activity.append(
            {
                "id": f"doc-{doc.id}",
                "type": "document",
                "title": f"Uploaded {doc.filename}",
                "status": doc.status,
                "created_at": _iso(doc.created_at),
            }
        )
    for message in messages[:16]:
        recent_activity.append(
            {
                "id": f"msg-{message.id}",
                "type": "message",
                "title": (message.content[:120] if message.content else "Message"),
                "status": message.role,
                "created_at": _iso(message.created_at),
            }
        )
    recent_activity.sort(key=lambda item: item.get("created_at") or "", reverse=True)

    return {
        "workspace": _serialize_workspace(workspace, db),
        "total_documents": len(docs),
        "ready_documents": len([doc for doc in docs if doc.status == "ready"]),
        "total_messages": len(messages),
        "total_chats": len(threads),
        "total_chunks": sum(int(doc.chunk_count or 0) for doc in docs),
        "recent_chats": recent_chats[:8],
        "recent_activity": recent_activity[:12],
        "collection": get_collection_stats(str(workspace.id)),
    }


@app.get("/workspaces/{workspace_id}/chat-threads")
async def list_chat_threads(
    workspace_id: str,
    q: Optional[str] = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    workspace = verify_workspace_access(workspace_id, current_user, db)
    _backfill_chat_ids_for_workspace(db, str(workspace.id))

    base_query = db.query(ChatThread).filter(ChatThread.workspace_id == workspace.id, ChatThread.status == "active")
    if q:
        like = f"%{q.strip()}%"
        base_query = base_query.filter(ChatThread.title.ilike(like))

    threads = (
        base_query.order_by(ChatThread.last_message_at.desc(), ChatThread.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    if not threads and offset == 0 and not q:
        thread = ChatThread(workspace_id=workspace.id, title="New Chat")
        db.add(thread)
        db.commit()
        db.refresh(thread)
        threads = [thread]

    thread_ids = [str(thread.id) for thread in threads]
    if not thread_ids:
        return []

    counts = (
        db.query(Message.chat_id, func.count(Message.id))
        .filter(Message.workspace_id == workspace.id, Message.chat_id.in_(thread_ids))
        .group_by(Message.chat_id)
        .all()
    )
    count_map = {str(chat_id): int(total) for chat_id, total in counts if chat_id}

    previews = (
        db.query(Message.chat_id, Message.content)
        .filter(Message.workspace_id == workspace.id, Message.chat_id.in_(thread_ids))
        .order_by(Message.created_at.desc())
        .all()
    )
    preview_map: Dict[str, str] = {}
    for chat_id, content in previews:
        key = str(chat_id) if chat_id else None
        if key and key not in preview_map:
            preview_map[key] = (content or "")[:120]

    return [
        {
            "id": str(thread.id),
            "workspace_id": str(thread.workspace_id),
            "title": thread.title,
            "status": thread.status,
            "created_at": _iso(thread.created_at),
            "updated_at": _iso(thread.updated_at),
            "last_message_at": _iso(thread.last_message_at),
            "message_count": count_map.get(str(thread.id), 0),
            "last_message_preview": preview_map.get(str(thread.id), ""),
        }
        for thread in threads
    ]


@app.post("/workspaces/{workspace_id}/chat-threads")
async def create_chat_thread(
    workspace_id: str,
    payload: ChatThreadCreate,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    workspace = verify_workspace_access(workspace_id, current_user, db)
    thread = ChatThread(workspace_id=workspace.id, title=_title_from_text(payload.title or "New Chat"))
    db.add(thread)
    db.commit()
    db.refresh(thread)
    return {
        "id": str(thread.id),
        "workspace_id": str(thread.workspace_id),
        "title": thread.title,
        "status": thread.status,
        "created_at": _iso(thread.created_at),
        "updated_at": _iso(thread.updated_at),
        "last_message_at": _iso(thread.last_message_at),
        "message_count": 0,
        "last_message_preview": "",
    }


@app.patch("/workspaces/{workspace_id}/chat-threads/{chat_id}")
async def update_chat_thread(
    workspace_id: str,
    chat_id: str,
    payload: ChatThreadUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    workspace = verify_workspace_access(workspace_id, current_user, db)
    _backfill_chat_ids_for_workspace(db, str(workspace.id))
    thread = (
        db.query(ChatThread)
        .filter(ChatThread.id == chat_id, ChatThread.workspace_id == workspace.id, ChatThread.status == "active")
        .first()
    )
    if not thread:
        raise HTTPException(status_code=404, detail="Chat thread not found")

    if payload.title is not None:
        title = payload.title.strip()
        if len(title) < 1:
            raise HTTPException(status_code=422, detail="Chat title is required")
        thread.title = title[:90]
    if payload.status is not None:
        thread.status = payload.status
    thread.updated_at = _now()
    db.commit()
    db.refresh(thread)

    return {
        "id": str(thread.id),
        "workspace_id": str(thread.workspace_id),
        "title": thread.title,
        "status": thread.status,
        "created_at": _iso(thread.created_at),
        "updated_at": _iso(thread.updated_at),
        "last_message_at": _iso(thread.last_message_at),
    }


@app.delete("/workspaces/{workspace_id}/chat-threads/{chat_id}")
async def remove_chat_thread(
    workspace_id: str,
    chat_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    workspace = verify_workspace_access(workspace_id, current_user, db)
    thread = (
        db.query(ChatThread)
        .filter(ChatThread.id == chat_id, ChatThread.workspace_id == workspace.id, ChatThread.status == "active")
        .first()
    )
    if not thread:
        raise HTTPException(status_code=404, detail="Chat thread not found")

    deleted_messages = (
        db.query(Message)
        .filter(Message.workspace_id == workspace.id, Message.chat_id == str(thread.id))
        .delete(synchronize_session=False)
    )
    db.delete(thread)
    db.commit()

    remaining = (
        db.query(ChatThread)
        .filter(ChatThread.workspace_id == workspace.id, ChatThread.status == "active")
        .order_by(ChatThread.last_message_at.desc(), ChatThread.created_at.desc())
        .first()
    )
    replacement_id = None
    if not remaining:
        replacement = ChatThread(workspace_id=workspace.id, title="New Chat")
        db.add(replacement)
        db.commit()
        db.refresh(replacement)
        replacement_id = str(replacement.id)
    else:
        replacement_id = str(remaining.id)

    return {
        "ok": True,
        "deleted_chat_id": chat_id,
        "deleted_messages": int(deleted_messages or 0),
        "replacement_chat_id": replacement_id,
    }


@app.get("/workspaces/{workspace_id}/messages/meta")
async def get_workspace_message_meta(
    workspace_id: str,
    chat_id: Optional[str] = Query(default=None),
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    workspace = verify_workspace_access(workspace_id, current_user, db)
    _backfill_chat_ids_for_workspace(db, str(workspace.id))

    query = db.query(Message).filter(Message.workspace_id == workspace.id)
    if chat_id:
        query = query.filter(Message.chat_id == chat_id)

    total = query.count()
    last = query.order_by(Message.created_at.desc()).first()
    return {
        "workspace_id": str(workspace.id),
        "chat_id": chat_id,
        "total_messages": int(total),
        "last_message_at": _iso(last.created_at if last else None),
    }


@app.get("/workspaces/{workspace_id}/messages")
async def get_workspace_messages(
    workspace_id: str,
    chat_id: Optional[str] = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=120, ge=1, le=600),
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    workspace = verify_workspace_access(workspace_id, current_user, db)
    _backfill_chat_ids_for_workspace(db, str(workspace.id))

    query = db.query(Message).filter(Message.workspace_id == workspace.id)
    if chat_id:
        query = query.filter(Message.chat_id == chat_id)

    messages = query.order_by(Message.created_at.desc()).offset(offset).limit(limit).all()
    messages = list(reversed(messages))
    return [_serialize_message(message) for message in messages]


@app.post("/workspaces/{workspace_id}/upload")
async def upload_documents(
    workspace_id: str,
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    workspace = verify_workspace_access(workspace_id, current_user, db)
    results: List[Dict[str, Any]] = []
    allowed = {"pdf", "docx", "doc", "txt"}

    for file in files:
        if not file.filename:
            continue

        ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
        if ext not in allowed:
            results.append({"filename": file.filename, "status": "error", "message": f"File type .{ext} not supported"})
            continue

        file_bytes = await file.read()
        doc = Document(
            workspace_id=workspace.id,
            filename=file.filename,
            original_filename=file.filename,
            file_type=ext,
            file_size=len(file_bytes),
            status="processing",
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)

        background_tasks.add_task(
            _process_document,
            workspace_id=str(workspace.id),
            doc_id=str(doc.id),
            filename=file.filename,
            file_type=ext,
            file_bytes=file_bytes,
        )
        results.append(
            {
                "doc_id": str(doc.id),
                "filename": file.filename,
                "file_size": len(file_bytes),
                "status": "processing",
                "chunk_count": 0,
                "created_at": _iso(doc.created_at),
            }
        )

    return {"uploaded": len(results), "documents": results}


@app.get("/workspaces/{workspace_id}/documents")
async def list_documents(
    workspace_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    workspace = verify_workspace_access(workspace_id, current_user, db)
    documents = (
        db.query(Document)
        .filter(Document.workspace_id == workspace.id)
        .order_by(Document.created_at.desc())
        .all()
    )
    return [
        {
            "doc_id": str(doc.id),
            "filename": doc.filename,
            "original_filename": doc.original_filename,
            "file_type": doc.file_type,
            "file_size": doc.file_size,
            "status": doc.status,
            "chunk_count": int(doc.chunk_count or 0),
            "storage_path": doc.storage_path,
            "error_message": doc.error_message,
            "created_at": _iso(doc.created_at),
        }
        for doc in documents
    ]


@app.delete("/workspaces/{workspace_id}/documents/{doc_id}")
async def delete_document(
    workspace_id: str,
    doc_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    workspace = verify_workspace_access(workspace_id, current_user, db)
    document = db.query(Document).filter(Document.id == doc_id, Document.workspace_id == workspace.id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    deleted_chunks = delete_document_chunks(str(workspace.id), str(document.id))
    db.delete(document)
    db.commit()
    return {"ok": True, "doc_id": str(doc_id), "deleted_chunks": int(deleted_chunks)}


@app.post("/chat/stream")
async def chat_stream(
    payload: ChatRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    workspace = verify_workspace_access(payload.workspace_id, current_user, db)
    chat = _get_chat_thread(db, str(workspace.id), payload.chat_id, payload.message)
    chat_id = str(chat.id)

    if chat.title == "New Chat":
        chat.title = _title_from_text(payload.message)
        db.commit()

    user_message = Message(
        workspace_id=str(workspace.id),
        chat_id=chat_id,
        role="user",
        content=payload.message,
        message_type="chat",
        metadata_={"chat_id": chat_id},
    )
    db.add(user_message)
    db.commit()

    async def generate() -> AsyncGenerator[str, None]:
        try:
            yield "data: " + json.dumps({"type": "stage", "stage": "Analyzing your workspace documents..."}) + "\n\n"
            doc_chunks = semantic_search(str(workspace.id), payload.message, top_k=settings.top_k_chunks)

            yield "data: " + json.dumps({"type": "stage", "stage": "Searching Indian Kanoon precedents..."}) + "\n\n"
            kanoon_results = await search_precedents(payload.message, num_results=4)

            messages = build_rag_prompt(
                query=payload.message,
                doc_chunks=doc_chunks,
                kanoon_results=kanoon_results,
                conversation_history=payload.conversation_history,
            )

            yield "data: " + json.dumps({"type": "stage", "stage": "Generating legal response..."}) + "\n\n"
            assistant_text = ""
            async for token in stream_completion(
                messages=messages,
                system_prompt=LEGAL_SYSTEM_PROMPT,
                temperature=0.3,
                max_tokens=2048,
            ):
                assistant_text += token
                yield "data: " + json.dumps({"type": "token", "token": token}) + "\n\n"

            citations = [
                {
                    "title": item.get("title"),
                    "court": item.get("court"),
                    "date": item.get("date"),
                    "url": item.get("url"),
                    "citation": item.get("citation"),
                    "snippet": item.get("snippet"),
                    "type": "kanoon",
                }
                for item in kanoon_results
            ]
            citations.extend(
                [
                    {
                        "title": chunk.get("filename"),
                        "section": chunk.get("section"),
                        "score": chunk.get("relevance_score"),
                        "type": "document",
                    }
                    for chunk in doc_chunks[:4]
                ]
            )

            if citations:
                yield "data: " + json.dumps({"type": "citations", "citations": citations}) + "\n\n"

            assistant_message = Message(
                workspace_id=str(workspace.id),
                chat_id=chat_id,
                role="assistant",
                content=assistant_text.strip() or "No response generated.",
                message_type="chat",
                citations=citations,
                metadata_={"chat_id": chat_id},
            )
            db.add(assistant_message)
            chat.last_message_at = _now()
            db.commit()

            yield "data: " + json.dumps({"type": "done"}) + "\n\n"
        except Exception as exc:
            logger.exception("Chat stream error: %s", exc)
            error_message = Message(
                workspace_id=str(workspace.id),
                chat_id=chat_id,
                role="assistant",
                content=f"Error: {exc}",
                message_type="chat",
                metadata_={"chat_id": chat_id, "error": True},
            )
            db.add(error_message)
            db.commit()
            yield "data: " + json.dumps({"type": "error", "error": str(exc)}) + "\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/search/stream")
async def search_stream(
    payload: SearchRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    workspace = verify_workspace_access(payload.workspace_id, current_user, db)
    chat = _get_chat_thread(db, str(workspace.id), payload.chat_id, payload.query)
    wrapped = _persist_stream_response(
        workspace_id=str(workspace.id),
        chat_id=str(chat.id),
        message_type="search",
        user_text=payload.query,
        stream=stream_legal_search(str(workspace.id), payload.query),
        db=db,
    )
    return StreamingResponse(
        wrapped,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/verdict/stream")
async def verdict_stream(
    payload: VerdictRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    workspace = verify_workspace_access(payload.workspace_id, current_user, db)
    chat = _get_chat_thread(db, str(workspace.id), payload.chat_id, payload.case_facts)
    wrapped = _persist_stream_response(
        workspace_id=str(workspace.id),
        chat_id=str(chat.id),
        message_type="verdict",
        user_text=payload.case_facts,
        stream=stream_verdict_prediction(str(workspace.id), payload.case_facts),
        db=db,
    )
    return StreamingResponse(
        wrapped,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/draft/stream")
async def draft_stream(
    payload: DraftRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    workspace_id = payload.workspace_id
    chat_id: Optional[str] = None

    if workspace_id:
        workspace = verify_workspace_access(workspace_id, current_user, db)
        chat = _get_chat_thread(db, str(workspace.id), payload.chat_id, payload.doc_type)
        workspace_id = str(workspace.id)
        chat_id = str(chat.id)

    stream = stream_draft_document(payload.doc_type, payload.details, workspace_id)
    if not workspace_id:
        return StreamingResponse(
            stream,
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    wrapped = _persist_stream_response(
        workspace_id=workspace_id,
        chat_id=chat_id,
        message_type="draft",
        user_text=f"Generate {payload.doc_type} document",
        stream=stream,
        db=db,
    )
    return StreamingResponse(
        wrapped,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/counter-arguments/stream")
async def counter_arguments_stream(
    payload: CounterArgRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    workspace = verify_workspace_access(payload.workspace_id, current_user, db)
    petition_text = (payload.petition_text or "").strip()
    if not petition_text and payload.doc_id:
        chunks = semantic_search(str(workspace.id), "main arguments claims", top_k=8, doc_id_filter=payload.doc_id)
        petition_text = "\n\n".join(chunk.get("text", "") for chunk in chunks)
    if not petition_text:
        raise HTTPException(status_code=400, detail="Provide petition_text or doc_id")

    chat = _get_chat_thread(db, str(workspace.id), payload.chat_id, petition_text)
    wrapped = _persist_stream_response(
        workspace_id=str(workspace.id),
        chat_id=str(chat.id),
        message_type="counter_args",
        user_text=petition_text,
        stream=stream_counter_arguments(str(workspace.id), petition_text),
        db=db,
    )
    return StreamingResponse(
        wrapped,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/search/kanoon")
async def kanoon_search(
    q: str = Query(..., min_length=2),
    limit: int = Query(default=6, ge=1, le=12),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    _ = current_user
    results = await search_precedents(q, num_results=limit)
    return {"query": q, "results": results}


@app.post("/report/generate")
async def generate_report(payload: ReportRequest) -> Response:
    try:
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
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=settings.port, reload=True)
