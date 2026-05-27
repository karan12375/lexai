import chromadb
from chromadb.config import Settings as ChromaSettings
from sentence_transformers import SentenceTransformer
from typing import List, Dict, Any, Optional
from config import get_settings
import logging

logger = logging.getLogger(__name__)
settings = get_settings()

# Singleton instances
_chroma_client = None
_embedding_model = None


def get_chroma_client() -> chromadb.Client:
    global _chroma_client
    if _chroma_client is None:
        _chroma_client = chromadb.PersistentClient(
            path=settings.chroma_persist_dir,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
    return _chroma_client


def get_embedding_model() -> SentenceTransformer:
    global _embedding_model
    if _embedding_model is None:
        logger.info(f"Loading embedding model: {settings.embedding_model}")
        _embedding_model = SentenceTransformer(settings.embedding_model)
    return _embedding_model


def get_or_create_collection(workspace_id: str) -> chromadb.Collection:
    """Each workspace gets its own ChromaDB collection."""
    client = get_chroma_client()
    collection_name = f"workspace_{workspace_id.replace('-', '_')}"
    collection = client.get_or_create_collection(
        name=collection_name,
        metadata={"hnsw:space": "cosine", "workspace_id": workspace_id}
    )
    return collection


def embed_and_store(
    workspace_id: str,
    chunks: List[Dict[str, Any]],
    doc_id: str
) -> int:
    """
    Generate embeddings for chunks and store in ChromaDB.
    Returns number of chunks stored.
    """
    if not chunks:
        return 0

    model = get_embedding_model()
    collection = get_or_create_collection(workspace_id)

    texts = [c["text"] for c in chunks]
    embeddings = model.encode(texts, show_progress_bar=False).tolist()

    ids = [f"{doc_id}_chunk_{c['chunk_index']}" for c in chunks]
    metadatas = [
        {
            "doc_id": c["doc_id"],
            "filename": c["filename"],
            "doc_type": c["doc_type"],
            "chunk_index": c["chunk_index"],
            "section": c.get("section", ""),
            "workspace_id": workspace_id,
        }
        for c in chunks
    ]

    # Upsert in batches of 100
    batch_size = 100
    for i in range(0, len(chunks), batch_size):
        collection.upsert(
            ids=ids[i:i+batch_size],
            embeddings=embeddings[i:i+batch_size],
            documents=texts[i:i+batch_size],
            metadatas=metadatas[i:i+batch_size],
        )

    logger.info(f"Stored {len(chunks)} chunks for workspace {workspace_id}, doc {doc_id}")
    return len(chunks)


def semantic_search(
    workspace_id: str,
    query: str,
    top_k: Optional[int] = None,
    doc_id_filter: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Retrieve top-K most relevant chunks for a query.
    Optionally filter by specific document.
    """
    model = get_embedding_model()
    collection = get_or_create_collection(workspace_id)

    # Check collection has documents
    count = collection.count()
    if count == 0:
        return []

    k = min(top_k or settings.top_k_chunks, count)
    query_embedding = model.encode([query]).tolist()

    where_filter = {"workspace_id": workspace_id}
    if doc_id_filter:
        where_filter["doc_id"] = doc_id_filter

    results = collection.query(
        query_embeddings=query_embedding,
        n_results=k,
        where=where_filter if len(where_filter) > 1 else None,
        include=["documents", "metadatas", "distances"]
    )

    chunks = []
    for i, (doc, meta, dist) in enumerate(zip(
        results["documents"][0],
        results["metadatas"][0],
        results["distances"][0]
    )):
        chunks.append({
            "text": doc,
            "filename": meta.get("filename", ""),
            "doc_type": meta.get("doc_type", ""),
            "section": meta.get("section", ""),
            "chunk_index": meta.get("chunk_index", i),
            "doc_id": meta.get("doc_id", ""),
            "relevance_score": round(1 - dist, 4),
        })

    return chunks


def delete_document_chunks(workspace_id: str, doc_id: str) -> int:
    """Delete all chunks for a specific document."""
    collection = get_or_create_collection(workspace_id)
    results = collection.get(where={"doc_id": doc_id})
    if results["ids"]:
        collection.delete(ids=results["ids"])
        return len(results["ids"])
    return 0


def delete_workspace_collection(workspace_id: str):
    """Delete entire workspace collection."""
    client = get_chroma_client()
    collection_name = f"workspace_{workspace_id.replace('-', '_')}"
    try:
        client.delete_collection(collection_name)
    except Exception:
        pass


def get_collection_stats(workspace_id: str) -> Dict[str, Any]:
    """Get stats for a workspace collection."""
    collection = get_or_create_collection(workspace_id)
    count = collection.count()
    return {"chunk_count": count, "workspace_id": workspace_id}
