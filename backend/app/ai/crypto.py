"""Symmetric encryption for stored provider keys. The Fernet key is derived from SECRET_KEY,
so rotating SECRET_KEY invalidates every stored API key (users simply re-enter them)."""

import base64
import hashlib
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings


@lru_cache
def _fernet() -> Fernet:
    digest = hashlib.sha256(("teamboard-ai-keys:" + get_settings().secret_key).encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt(plain: str) -> str:
    return _fernet().encrypt(plain.encode("utf-8")).decode("ascii")


def decrypt(token: str) -> str | None:
    """None when the token cannot be decrypted (e.g. SECRET_KEY was rotated)."""
    try:
        return _fernet().decrypt(token.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        return None
