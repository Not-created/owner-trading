"""
Centralized Configuration Engine.
Reads from environment variables. Validates required keys at startup.
Never hardcode secrets — all pulled from .env.
"""
import os
from functools import lru_cache
from typing import Optional
from pydantic import BaseModel


class Settings(BaseModel):
    # Database
    mongo_url: str
    db_name: str

    # Auth
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_ttl_min: int = 15
    refresh_token_ttl_days: int = 7

    # Owner (single-user platform)
    owner_username: str
    owner_password: str
    owner_email: str

    # Security
    encryption_key: str  # Fernet key (base64, 32 bytes)

    # HTTP cookies (must remain explicitly configurable for HTTP/IP deployments)
    # - cookie_secure: False is REQUIRED when serving over plain HTTP (no TLS)
    # - cookie_samesite: "lax" is required for HTTP cross-site cookie handling
    cookie_secure: bool = True
    cookie_samesite: str = "none"

    # CORS
    frontend_url: str

    # LLM
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    google_api_key: Optional[str] = None

    # Brute-force
    max_failed_attempts: int = 5
    lockout_minutes: int = 15


@lru_cache
def get_settings() -> Settings:
    return Settings(
        mongo_url=os.environ["MONGO_URL"],
        db_name=os.environ["DB_NAME"],
        jwt_secret=os.environ["JWT_SECRET"],
        owner_username=os.environ["OWNER_USERNAME"],
        owner_password=os.environ["OWNER_PASSWORD"],
        owner_email=os.environ["OWNER_EMAIL"],
        encryption_key=os.environ["ENCRYPTION_KEY"],
        frontend_url=os.environ["FRONTEND_URL"],
        cookie_secure=os.environ.get("COOKIE_SECURE", "true").lower() in ("1", "true", "yes"),
        cookie_samesite=os.environ.get("COOKIE_SAMESITE", "lax").lower(),
        openai_api_key=os.environ.get("OPENAI_API_KEY", ""),
        anthropic_api_key=os.environ.get("ANTHROPIC_API_KEY", ""),
        google_api_key=os.environ.get("GOOGLE_API_KEY", ""),
    )
    
