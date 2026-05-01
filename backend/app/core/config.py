from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Live Event Intelligence Platform"
    app_env: str = "development"
    api_prefix: str = "/api/v1"

    database_url: str = "sqlite:///./leip.db"
    redis_url: str = "redis://localhost:6379/0"

    jwt_secret_key: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24
    worker_internal_token: str = "local-worker-token"

    use_mock: bool = True
    mock_livescore_path: str = "mock_livescore.json"
    thesportsdb_api_key: str = "123"
    thesportsdb_base_url: str = "https://www.thesportsdb.com/api/v1/json"

    groq_api_key: str = ""
    groq_model: str = "llama-3.1-8b-instant"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


@lru_cache
def get_settings() -> Settings:
    return Settings()
