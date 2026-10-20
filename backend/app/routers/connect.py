"""REST endpoints that support connecting Claude: MCP info, personal tokens, and the OAuth consent step."""

from typing import Annotated
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, StringConstraints

from app.core.deps import CurrentUser
from app.mcp import oauth
from app.models import ApiToken

router = APIRouter(tags=["connect"])


class McpInfo(BaseModel):
    mcp_url: str
    oauth_enabled: bool
    public_url: str


class TokenOut(BaseModel):
    id: int
    name: str
    prefix: str
    created_at: str
    last_used_at: str | None


class TokenCreated(TokenOut):
    token: str


class TokenCreate(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


class ConsentInfo(BaseModel):
    client_name: str
    scopes: list[str]
    redirect_host: str


class ConsentIn(BaseModel):
    req: str
    approve: bool


class ConsentOut(BaseModel):
    redirect_to: str


def _token_out(row: ApiToken) -> TokenOut:
    return TokenOut(
        id=row.id,
        name=row.name,
        prefix=row.prefix,
        created_at=row.created_at.isoformat(),
        last_used_at=row.last_used_at.isoformat() if row.last_used_at else None,
    )


@router.get("/mcp-info", response_model=McpInfo)
async def mcp_info(_: CurrentUser) -> McpInfo:
    return McpInfo(mcp_url=oauth.mcp_url(), oauth_enabled=oauth.oauth_enabled(), public_url=oauth.public_url())


@router.get("/tokens", response_model=list[TokenOut])
async def list_tokens(user: CurrentUser) -> list[TokenOut]:
    rows = await ApiToken.filter(user_id=user.id, kind="personal", revoked=False).order_by("-created_at", "-id")
    return [_token_out(r) for r in rows]


@router.post("/tokens", response_model=TokenCreated, status_code=status.HTTP_201_CREATED)
async def create_token(payload: TokenCreate, user: CurrentUser) -> TokenCreated:
    if await ApiToken.filter(user_id=user.id, kind="personal", revoked=False).count() >= 20:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You already have 20 tokens; revoke one first")
    raw, row = await oauth.issue_personal_token(user, payload.name)
    return TokenCreated(**_token_out(row).model_dump(), token=raw)


@router.delete("/tokens/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_token(token_id: int, user: CurrentUser) -> Response:
    updated = await ApiToken.filter(id=token_id, user_id=user.id, kind="personal", revoked=False).update(revoked=True)
    if not updated:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Token not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/oauth/consent", response_model=ConsentInfo)
async def consent_info(req: str, _: CurrentUser) -> ConsentInfo:
    payload = oauth.decode_consent(req)
    if payload is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This authorization request is invalid or has expired. Start again from Claude.")
    return ConsentInfo(
        client_name=str(payload["client_name"]),
        scopes=list(payload["scopes"]),
        redirect_host=urlparse(payload["redirect_uri"]).netloc,
    )


@router.post("/oauth/consent", response_model=ConsentOut)
async def consent_decide(payload: ConsentIn, user: CurrentUser) -> ConsentOut:
    try:
        return ConsentOut(redirect_to=await oauth.complete_consent(payload.req, user, payload.approve))
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
