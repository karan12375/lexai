from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):

    # Pydantic v2 config
    model_config = {
        "env_file": ".env",
        "extra": "ignore",
        "protected_namespaces": ("settings_",)
    }

    # Groq
    groq_api_key: str = ""
    groq_base_url: str = "https://api.groq.com/openai/v1"
    model_name: str = "llama-3.3-70b-versatile"

    # Indian Kanoon
    indian_kanoon_api_key: str = ""

    # ChromaDB
    chroma_persist_dir: str = "./data/chromadb"

    # Embeddings
    embedding_model: str = "all-MiniLM-L6-v2"
    top_k_chunks: int = 6
    chunk_size: int = 600
    chunk_overlap: int = 50

    # Supabase
    supabase_url: str = ""
    supabase_key: str = ""
    supabase_service_key: str = ""
    database_url: str = ""

    # App
    port: int = 8000

    secret_key: str = (
        "changeme-use-random-32-char-string"
    )

    allowed_origins: str = (
        "http://localhost:5173,"
        "http://localhost:3000"
    )

    @property
    def origins_list(self):
        return [
            origin.strip()
            for origin in self.allowed_origins.split(",")
        ]


@lru_cache()
def get_settings():
    return Settings()