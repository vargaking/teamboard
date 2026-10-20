"""Tortoise / Aerich configuration. Aerich reads TORTOISE_ORM from here (see pyproject.toml).

DATABASE_URL accepts libpq-style `?sslmode=` so hosted Postgres connection strings (Supabase, Render, Neon)
work unchanged:
  sslmode=require | prefer   -> encrypted, server certificate NOT verified (what these providers document)
  sslmode=verify-full | verify-ca -> encrypted and verified against the system CA bundle
  (absent) -> plain connection (local docker compose)
"""

import ssl
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from tortoise.backends.base.config_generator import expand_db_url

from app.core.config import get_settings


def connection_config(url: str) -> str | dict[str, Any]:
    parsed = urlparse(url)
    params = dict(parse_qsl(parsed.query))
    sslmode = params.pop("sslmode", None)
    clean = urlunparse(parsed._replace(query=urlencode(params)))
    if sslmode in ("require", "prefer"):
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        config = expand_db_url(clean)
        config["credentials"]["ssl"] = context
        return config
    if sslmode in ("verify-full", "verify-ca"):
        config = expand_db_url(clean)
        config["credentials"]["ssl"] = True
        return config
    return clean


TORTOISE_ORM = {
    "connections": {"default": connection_config(get_settings().database_url)},
    "apps": {
        "models": {
            "models": ["app.models", "aerich.models"],
            "default_connection": "default",
        }
    },
    "use_tz": True,
    "timezone": "UTC",
}
