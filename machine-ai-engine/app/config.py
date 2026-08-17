# app/config.py
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    host: str = "0.0.0.0"
    port: int = 8000
    database_url: str

    # --- Router / Classification Model (e.g. Fast local model) ---
    router_provider: str = "ollama"
    router_model_name: str = "qwen2.5:7b"
    router_base_url: Optional[str] = "http://localhost:11434/v1"
    router_api_key: Optional[str] = "local"

    # --- Summarizer Model ---
    summarizer_provider: str = "ollama"
    summarizer_model_name: str = "llama3.1:8b"
    summarizer_base_url: Optional[str] = "http://localhost:11434/v1"
    summarizer_api_key: Optional[str] = "local"

    # --- Technical RAG Agent (e.g. Local Heavy Llama-70B or Cloud GPT-4o / Gemini) ---
    technical_agent_provider: str = "ollama"
    technical_agent_model_name: str = "llama3.1:70b"
    technical_agent_base_url: Optional[str] = "http://localhost:11434/v1"
    technical_agent_api_key: Optional[str] = "local"

    # --- Operational IoT Agent (SQL Generation) ---
    operational_agent_provider: str = "openai"
    operational_agent_model_name: str = "gpt-4o-mini"
    operational_agent_base_url: Optional[str] = "https://api.openai.com/v1"
    operational_agent_api_key: Optional[str] = "sk-..."

    # --- Commercial Agent ---
    commercial_agent_provider: str = "gemini"
    commercial_agent_model_name: str = "gemini-1.5-flash"
    commercial_agent_base_url: Optional[str] = "https://generativelanguage.googleapis.com/v1beta/openai/"
    commercial_agent_api_key: Optional[str] = "your-gemini-api-key"

    # --- General / Fallback ---
    general_provider: str = "ollama"
    general_model_name: str = "llama3.1:8b"
    general_base_url: Optional[str] = "http://localhost:11434/v1"
    general_api_key: Optional[str] = "local"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="allow")

settings = Settings()