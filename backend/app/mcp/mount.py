"""Mount the MCP transport and the OAuth authorization server into the FastAPI app.

Public paths (relative to PUBLIC_URL):
  /api/mcp                                         MCP endpoint (streamable HTTP, Bearer-protected)
  /api/oauth/{authorize,token,register,revoke}     OAuth 2.1 endpoints (DCR + PKCE), via the MCP SDK
  /.well-known/oauth-protected-resource/<...>/api/mcp    RFC 9728 (points clients at the issuer)
  /.well-known/oauth-authorization-server/<...>/api/oauth  RFC 8414 (path-insertion form)
  /api/oauth/.well-known/oauth-authorization-server         (path-appending form, served by the SDK)
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from mcp.server.auth.routes import build_metadata, create_auth_routes
from mcp.server.auth.settings import ClientRegistrationOptions, RevocationOptions
from pydantic import AnyHttpUrl
from starlette.applications import Starlette

from app.core.config import get_settings
from app.mcp.oauth import SCOPE, TeamBoardOAuthProvider, issuer_url, mcp_url, oauth_enabled
from app.mcp.server import mcp_server

log = logging.getLogger(__name__)


def mount_mcp(app: FastAPI) -> None:
    public_prefix = urlparse(mcp_url()).path.removesuffix("/api/mcp")  # "" or e.g. "/board"

    if oauth_enabled():
        registration = ClientRegistrationOptions(enabled=True, valid_scopes=[SCOPE], default_scopes=[SCOPE])
        revocation = RevocationOptions(enabled=True)
        issuer = AnyHttpUrl(issuer_url())
        auth_app = Starlette(routes=create_auth_routes(TeamBoardOAuthProvider(), issuer, None, registration, revocation))
        app.mount("/api/oauth", auth_app)

        metadata = build_metadata(issuer, None, registration, revocation).model_dump(mode="json", exclude_none=True)

        @app.get(f"/.well-known/oauth-authorization-server{public_prefix}/api/oauth", include_in_schema=False)
        async def authorization_server_metadata() -> JSONResponse:  # RFC 8414 path-insertion form
            return JSONResponse(metadata)

        @app.get("/.well-known/oauth-authorization-server", include_in_schema=False)
        async def authorization_server_metadata_root() -> JSONResponse:  # some clients try the root first
            return JSONResponse(metadata)

    else:
        log.warning("PUBLIC_URL is not HTTPS: OAuth (claude.ai connector) is disabled; personal tokens still work on /api/mcp")

    # Transport app: /api/mcp (Bearer-protected) + /.well-known/oauth-protected-resource<prefix>/api/mcp.
    # Mounted at the root so the .well-known route sits at the origin root as RFC 9728 requires. The real app is
    # (re)built on every startup because the SDK's session manager can only be run once per instance.
    static_dir = get_settings().static_dir
    if static_dir:
        if not (Path(static_dir) / "index.html").is_file():
            raise RuntimeError(f"STATIC_DIR={static_dir} does not contain a built frontend (index.html)")
        _Delegate.spa = _Spa(static_dir)
        log.info("serving the frontend from %s", static_dir)
    app.mount("/", _Delegate())


class _Delegate:
    """Catch-all mounted at "/": MCP paths go to the transport app built by `run_transport()` for the current
    lifespan; everything else is the single-page frontend when STATIC_DIR is configured (single-service hosting),
    otherwise 404."""

    current: Starlette | None = None
    spa: "_Spa | None" = None

    async def __call__(self, scope, receive, send) -> None:  # type: ignore[no-untyped-def]
        path = scope.get("path", "") if scope["type"] == "http" else ""
        if scope["type"] == "lifespan" or path == "/api/mcp" or path.startswith("/.well-known/oauth-protected-resource"):
            if _Delegate.current is None:
                response = JSONResponse({"detail": "MCP transport not started"}, status_code=503)
                await response(scope, receive, send)
                return
            await _Delegate.current(scope, receive, send)
            return
        if _Delegate.spa is not None and scope["type"] == "http":
            await _Delegate.spa(scope, receive, send)
            return
        await JSONResponse({"detail": "Not Found"}, status_code=404)(scope, receive, send)


class _Spa:
    """Serve a Vite build: real files as-is (hashed assets cached for a year), everything else -> index.html."""

    def __init__(self, directory: str) -> None:
        self.root = Path(directory).resolve()
        self.index = self.root / "index.html"

    async def __call__(self, scope, receive, send) -> None:  # type: ignore[no-untyped-def]
        if scope["method"] not in ("GET", "HEAD"):
            await JSONResponse({"detail": "Method Not Allowed"}, status_code=405)(scope, receive, send)
            return
        relative = scope["path"].lstrip("/")
        candidate = (self.root / relative).resolve() if relative else self.index
        if candidate.is_relative_to(self.root) and candidate.is_file():
            headers = (
                {"Cache-Control": "public, max-age=31536000, immutable"}
                if relative.startswith("assets/")
                else {"Cache-Control": "no-cache"}
            )
            await FileResponse(candidate, headers=headers)(scope, receive, send)
            return
        if scope["path"].startswith("/api/"):
            await JSONResponse({"detail": "Not Found"}, status_code=404)(scope, receive, send)
            return
        await FileResponse(self.index, headers={"Cache-Control": "no-cache"})(scope, receive, send)


@asynccontextmanager
async def run_transport() -> AsyncIterator[None]:
    """Use in the FastAPI lifespan: builds the transport app and runs its session manager."""
    _Delegate.current = mcp_server.streamable_http_app(
        streamable_http_path="/api/mcp",
        stateless_http=True,
        json_response=True,
        host="0.0.0.0",  # we sit behind nginx; the SDK's localhost DNS-rebinding guard would reject proxied Host headers
    )
    try:
        async with mcp_server.session_manager.run():
            yield
    finally:
        _Delegate.current = None
