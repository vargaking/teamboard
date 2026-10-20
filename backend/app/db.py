"""Tortoise / Aerich configuration. Aerich reads TORTOISE_ORM from here (see pyproject.toml)."""

from app.core.config import get_settings

TORTOISE_ORM = {
    "connections": {"default": get_settings().database_url},
    "apps": {
        "models": {
            "models": ["app.models", "aerich.models"],
            "default_connection": "default",
        }
    },
    "use_tz": True,
    "timezone": "UTC",
}
