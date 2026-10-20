import os
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "TeamBoard"
    database_url: str = Field(
        default="postgres://teamboard:teamboard@localhost:5432/teamboard",
        description="Tortoise-style DB URL, e.g. postgres://user:pass@host:5432/db or sqlite://:memory:",
    )
    secret_key: str = Field(default="change-me-in-production-please", min_length=16)
    access_token_expire_minutes: int = 60 * 24 * 7  # one week
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000", "http://localhost:8080"]
    # When true, Tortoise creates tables itself at startup. Keep false in production (Aerich owns the schema).
    auto_generate_schemas: bool = False
    seed_on_startup: bool = False
    seed_password: str = "changeme"
    # Public origin (plus path prefix, if any) users reach the app at, e.g. https://board.example.com or
    # https://vm.example/board. Used for OAuth issuer/resource URLs and the MCP URL shown in the UI.
    public_url: str = Field(default_factory=lambda: os.environ.get("RENDER_EXTERNAL_URL", "http://localhost:8080"))
    # When set to a directory containing the built frontend (dist/), the API also serves the SPA from "/".
    # Used by the single-service Docker image (root Dockerfile) for Render-style hosting.
    static_dir: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
