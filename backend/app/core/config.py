from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    APP_ENV: str = "dev"
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000

    DATABASE_URL: str
    REDIS_URL: str | None = None

    JWT_SECRET: str
    SESSION_SECRET: str

    OPENCLAW_API_BASE: str = "http://127.0.0.1:18789/v1"
    OPENCLAW_API_TOKEN: str | None = None

    FRONTEND_BASE_URL: str = "https://interview.botelo.ru"
    EMAIL_VERIFY_TOKEN_TTL_HOURS: int = 48

    SMTP_HOST: str | None = None
    SMTP_PORT: int = 465
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_FROM: str | None = None


@lru_cache

def get_settings() -> Settings:
    return Settings()
