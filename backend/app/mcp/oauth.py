"""OAuth 2.1 authorization server backing the MCP endpoint.

The MCP SDK implements the HTTP endpoints (metadata, dynamic client registration, /authorize, /token, PKCE
checks, /revoke); this module is the storage and policy behind them plus the user-consent handoff:

    client --/authorize--> provider.authorize() --redirect--> SPA /oauth/consent?req=<signed jwt>
    SPA (logged in) --POST /api/oauth/consent--> issue code --redirect--> client redirect_uri?code=..

Tokens are opaque random strings; only their SHA-256 hash is stored (app.models.ApiToken).
"""

import hashlib
import secrets
import time
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlparse

import jwt
from mcp.server.auth.provider import (
    AccessToken,
    AuthorizationCode,
    AuthorizationParams,
    AuthorizeError,
    RefreshToken,
    TokenError,
    construct_redirect_uri,
)
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken
from pydantic import AnyUrl

from app.core.config import get_settings
from app.models import ApiToken, OAuthAuthorizationCode, OAuthClient, User

SCOPE = "board"  # one scope: full access as the authorizing user
ACCESS_TOKEN_TTL = timedelta(hours=1)
REFRESH_TOKEN_TTL = timedelta(days=30)
CODE_TTL_SECONDS = 300
CONSENT_TTL_SECONDS = 600
PERSONAL_PREFIX = "tb_pat_"


def public_url() -> str:
    return get_settings().public_url.rstrip("/")


def mcp_url() -> str:
    return f"{public_url()}/api/mcp"


def issuer_url() -> str:
    return f"{public_url()}/api/oauth"


def oauth_enabled() -> bool:
    """The SDK refuses non-HTTPS issuers except localhost; claude.ai needs HTTPS anyway."""
    parsed = urlparse(public_url())
    return parsed.scheme == "https" or parsed.hostname in ("localhost", "127.0.0.1")


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _now() -> datetime:
    return datetime.now(UTC)


async def _store_token(kind: str, user_id: int, client_id: str | None, scopes: list[str], ttl: timedelta | None, name: str = "") -> str:
    raw = (PERSONAL_PREFIX if kind == "personal" else f"tb_{kind[:3]}_") + secrets.token_urlsafe(32)
    await ApiToken.create(
        token_hash=hash_token(raw),
        kind=kind,
        name=name,
        prefix=raw[:12],
        client_id=client_id,
        user_id=user_id,
        scopes=scopes,
        resource=mcp_url(),
        expires_at=(_now() + ttl) if ttl else None,
    )
    return raw


async def issue_personal_token(user: User, name: str) -> tuple[str, ApiToken]:
    raw = await _store_token("personal", user.id, None, [SCOPE], None, name=name)
    row = await ApiToken.get(token_hash=hash_token(raw))
    return raw, row


# ---------- consent request (signed, short-lived, carried through the SPA) ----------
def _sign_consent(client: OAuthClientInformationFull, params: AuthorizationParams) -> str:
    payload = {
        "typ": "consent",
        "client_id": client.client_id,
        "client_name": client.client_name or client.client_id,
        "redirect_uri": str(params.redirect_uri),
        "redirect_uri_provided_explicitly": params.redirect_uri_provided_explicitly,
        "state": params.state,
        "scopes": params.scopes or [SCOPE],
        "code_challenge": params.code_challenge,
        "resource": params.resource,
        "exp": int(time.time()) + CONSENT_TTL_SECONDS,
        "nonce": secrets.token_urlsafe(8),
    }
    return jwt.encode(payload, get_settings().secret_key, algorithm="HS256")


def decode_consent(req: str) -> dict[str, Any] | None:
    try:
        payload = jwt.decode(req, get_settings().secret_key, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    return payload if payload.get("typ") == "consent" else None


async def complete_consent(req: str, user: User, approve: bool) -> str:
    """Called by POST /api/oauth/consent. Returns the URL to send the browser to."""
    payload = decode_consent(req)
    if payload is None:
        raise ValueError("This authorization request is invalid or has expired. Start again from Claude.")
    redirect_uri = payload["redirect_uri"]
    # `iss` on every authorization response (RFC 9207) - ChatGPT asks for it, harmless for other clients.
    if not approve:
        return construct_redirect_uri(redirect_uri, error="access_denied", state=payload.get("state"), iss=issuer_url())
    code = secrets.token_urlsafe(32)
    await OAuthAuthorizationCode.create(
        code=code,
        client_id=payload["client_id"],
        user_id=user.id,
        scopes=payload["scopes"],
        code_challenge=payload["code_challenge"],
        redirect_uri=redirect_uri,
        redirect_uri_provided_explicitly=payload["redirect_uri_provided_explicitly"],
        resource=payload.get("resource"),
        expires_at=time.time() + CODE_TTL_SECONDS,
    )
    return construct_redirect_uri(redirect_uri, code=code, state=payload.get("state"), iss=issuer_url())


# ---------- the provider the SDK calls ----------
class TeamBoardOAuthProvider:
    async def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        row = await OAuthClient.get_or_none(client_id=client_id)
        return OAuthClientInformationFull.model_validate(row.metadata) if row else None

    async def register_client(self, client_info: OAuthClientInformationFull) -> None:
        await OAuthClient.create(client_id=client_info.client_id, metadata=client_info.model_dump(mode="json"))

    async def authorize(self, client: OAuthClientInformationFull, params: AuthorizationParams) -> str:
        if params.scopes and any(s != SCOPE for s in params.scopes):
            raise AuthorizeError("invalid_scope", f"Only the '{SCOPE}' scope is available")
        return f"{get_settings().effective_frontend_url}/oauth/consent?req={_sign_consent(client, params)}"

    async def load_authorization_code(self, client: OAuthClientInformationFull, authorization_code: str) -> AuthorizationCode | None:
        row = await OAuthAuthorizationCode.get_or_none(code=authorization_code, client_id=client.client_id)
        if row is None:
            return None
        return AuthorizationCode(
            code=row.code,
            scopes=list(row.scopes),
            expires_at=row.expires_at,
            client_id=row.client_id,
            code_challenge=row.code_challenge,
            redirect_uri=AnyUrl(row.redirect_uri),
            redirect_uri_provided_explicitly=row.redirect_uri_provided_explicitly,
            resource=row.resource,
            subject=str(row.user_id),  # type: ignore[attr-defined]
        )

    async def exchange_authorization_code(self, client: OAuthClientInformationFull, authorization_code: AuthorizationCode) -> OAuthToken:
        deleted = await OAuthAuthorizationCode.filter(code=authorization_code.code).delete()  # single use
        if not deleted or authorization_code.subject is None:
            raise TokenError("invalid_grant", "Authorization code already used")
        user_id = int(authorization_code.subject)
        return await self._issue_pair(user_id, client.client_id, authorization_code.scopes)

    async def _issue_pair(self, user_id: int, client_id: str, scopes: list[str]) -> OAuthToken:
        access = await _store_token("access", user_id, client_id, scopes, ACCESS_TOKEN_TTL)
        refresh = await _store_token("refresh", user_id, client_id, scopes, REFRESH_TOKEN_TTL)
        return OAuthToken(
            access_token=access,
            token_type="Bearer",
            expires_in=int(ACCESS_TOKEN_TTL.total_seconds()),
            scope=" ".join(scopes),
            refresh_token=refresh,
        )

    async def load_refresh_token(self, client: OAuthClientInformationFull, refresh_token: str) -> RefreshToken | None:
        row = await ApiToken.get_or_none(token_hash=hash_token(refresh_token), kind="refresh", client_id=client.client_id, revoked=False)
        if row is None or (row.expires_at is not None and row.expires_at < _now()):
            return None
        return RefreshToken(
            token=refresh_token,
            client_id=row.client_id or client.client_id,
            scopes=list(row.scopes),
            expires_at=int(row.expires_at.timestamp()) if row.expires_at else None,
            resource=row.resource,
            subject=str(row.user_id),  # type: ignore[attr-defined]
        )

    async def exchange_refresh_token(
        self, client: OAuthClientInformationFull, refresh_token: RefreshToken, scopes: list[str]
    ) -> OAuthToken:
        # Rotate: the old refresh token is revoked and a new pair is issued.
        updated = await ApiToken.filter(token_hash=hash_token(refresh_token.token), kind="refresh", revoked=False).update(revoked=True)
        if not updated or refresh_token.subject is None:
            raise TokenError("invalid_grant", "Refresh token is no longer valid")
        return await self._issue_pair(int(refresh_token.subject), client.client_id, scopes or refresh_token.scopes)

    async def load_access_token(self, token: str) -> AccessToken | None:
        return await verify_bearer_token(token)

    async def revoke_token(self, token: AccessToken | RefreshToken) -> None:
        await ApiToken.filter(token_hash=hash_token(token.token)).update(revoked=True)


async def verify_bearer_token(token: str) -> AccessToken | None:
    """Accepts OAuth access tokens and personal tokens. Also used by the bearer middleware on /api/mcp."""
    row = await ApiToken.get_or_none(token_hash=hash_token(token), kind__in=["access", "personal"], revoked=False)
    if row is None or (row.expires_at is not None and row.expires_at < _now()):
        return None
    await ApiToken.filter(id=row.id).update(last_used_at=_now())
    return AccessToken(
        token=token,
        client_id=row.client_id or "personal",
        scopes=list(row.scopes),
        expires_at=int(row.expires_at.timestamp()) if row.expires_at else None,
        resource=row.resource,
        subject=str(row.user_id),  # type: ignore[attr-defined]
    )


class TeamBoardTokenVerifier:
    async def verify_token(self, token: str) -> AccessToken | None:
        return await verify_bearer_token(token)
