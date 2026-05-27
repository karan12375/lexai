import uuid
from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    create_engine,
    inspect,
    text,
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from sqlalchemy.sql import func

from config import get_settings

settings = get_settings()

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=12,
    max_overflow=24,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def generate_id():
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_id)
    email = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    avatar_url = Column(String, nullable=True)
    supabase_uid = Column(String, unique=True, nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    workspaces = relationship("Workspace", back_populates="user", cascade="all, delete-orphan")


class Workspace(Base):
    __tablename__ = "workspaces"
    __table_args__ = (
        Index("idx_workspaces_user_status_created", "user_id", "status", "created_at"),
        Index("idx_workspaces_user_name", "user_id", "name"),
    )

    id = Column(String, primary_key=True, default=generate_id)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    case_type = Column(String, nullable=True)
    status = Column(String, default="active")
    chroma_collection_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", back_populates="workspaces")
    documents = relationship("Document", back_populates="workspace", cascade="all, delete-orphan")
    messages = relationship("Message", back_populates="workspace", cascade="all, delete-orphan")
    chat_threads = relationship("ChatThread", back_populates="workspace", cascade="all, delete-orphan")


class ChatThread(Base):
    __tablename__ = "chat_threads"
    __table_args__ = (
        Index("idx_chat_threads_workspace_status_last", "workspace_id", "status", "last_message_at"),
        Index("idx_chat_threads_workspace_created", "workspace_id", "created_at"),
    )

    id = Column(String, primary_key=True, default=generate_id)
    workspace_id = Column(String, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String, nullable=False)
    status = Column(String, default="active")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_message_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    workspace = relationship("Workspace", back_populates="chat_threads")
    messages = relationship("Message", back_populates="chat_thread")


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (
        Index("idx_documents_workspace_status_created", "workspace_id", "status", "created_at"),
        Index("idx_documents_workspace_filename", "workspace_id", "filename"),
    )

    id = Column(String, primary_key=True, default=generate_id)
    workspace_id = Column(String, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String, nullable=False)
    original_filename = Column(String, nullable=False)
    file_type = Column(String, nullable=False)
    file_size = Column(Integer, nullable=True)
    storage_path = Column(String, nullable=True)
    status = Column(String, default="uploading")
    chunk_count = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    workspace = relationship("Workspace", back_populates="documents")


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (
        Index("idx_messages_workspace_chat_created", "workspace_id", "chat_id", "created_at"),
        Index("idx_messages_workspace_type_created", "workspace_id", "message_type", "created_at"),
        Index("idx_messages_workspace_role_created", "workspace_id", "role", "created_at"),
    )

    id = Column(String, primary_key=True, default=generate_id)
    workspace_id = Column(String, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    chat_id = Column(String, ForeignKey("chat_threads.id", ondelete="SET NULL"), nullable=True, index=True)
    role = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    message_type = Column(String, default="chat")
    citations = Column(JSON, nullable=True)
    metadata_ = Column("metadata", JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    workspace = relationship("Workspace", back_populates="messages")
    chat_thread = relationship("ChatThread", back_populates="messages")


class SearchHistory(Base):
    __tablename__ = "search_history"
    __table_args__ = (
        Index("idx_search_history_user_workspace_created", "user_id", "workspace_id", "created_at"),
    )

    id = Column(String, primary_key=True, default=generate_id)
    workspace_id = Column(String, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    query = Column(Text, nullable=False)
    results = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class GeneratedDocument(Base):
    __tablename__ = "generated_documents"
    __table_args__ = (
        Index("idx_generated_documents_workspace_type_created", "workspace_id", "document_type", "created_at"),
    )

    id = Column(String, primary_key=True, default=generate_id)
    workspace_id = Column(String, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String, nullable=False)
    document_type = Column(String, nullable=True)
    content = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class VerdictAnalysis(Base):
    __tablename__ = "verdict_analyses"
    __table_args__ = (
        Index("idx_verdict_analyses_workspace_created", "workspace_id", "created_at"),
    )

    id = Column(String, primary_key=True, default=generate_id)
    workspace_id = Column(String, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    result = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


def _safe_add_column_messages_chat_id():
    inspector = inspect(engine)
    if "messages" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("messages")}
    if "chat_id" in columns:
        return
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE messages ADD COLUMN chat_id VARCHAR"))
    with engine.begin() as connection:
        connection.execute(text("CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id)"))


def create_tables():
    Base.metadata.create_all(bind=engine)
    _safe_add_column_messages_chat_id()

