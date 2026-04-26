from pydantic_settings import BaseSettings
from pydantic import ConfigDict

class Settings(BaseSettings):
    model_config = ConfigDict(env_prefix="TIDBIT_")

    ollama_base_url: str = "http://localhost:11434"
    llm_model: str = "qwen2.5:14b"
    embed_model: str = "nomic-embed-text"
    embed_dims: int = 768
    qdrant_host: str = "localhost"
    qdrant_port: int = 6333
    sqlite_path: str = "/tmp/tidbit_history.db"
    host: str = "0.0.0.0"
    port: int = 8000

settings = Settings()

def mem0_config(collection_name: str) -> dict:
    return {
        "llm": {
            "provider": "ollama",
            "config": {
                "model": settings.llm_model,
                "ollama_base_url": settings.ollama_base_url,
            }
        },
        "embedder": {
            "provider": "ollama",
            "config": {
                "model": settings.embed_model,
                "ollama_base_url": settings.ollama_base_url,
            }
        },
        "vector_store": {
            "provider": "qdrant",
            "config": {
                "collection_name": collection_name,
                "host": settings.qdrant_host,
                "port": settings.qdrant_port,
                "embedding_model_dims": settings.embed_dims,
            }
        },
        "history_db_path": settings.sqlite_path,
    }
