"""Admin user management and invite links."""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field, StringConstraints
from tortoise.exceptions import IntegrityError
from tortoise.transactions import in_transaction

from app.core.config import get_settings
from app.core.deps import CurrentUser
from app.core.security import create_access_token, hash_password
from app.models import Board, Invite, User
from app.realtime import hub
from app.schemas import Email, TokenOut, UserOut

router = APIRouter(tags=["team"])

PALETTE = [
    "#1677ff",
    "#fa541c",
    "#13c2c2",
    "#722ed1",
    "#52c41a",
    "#eb2f96",
    "#faad14",
    "#2f54eb",
    "#a0d911",
    "#f5222d",
    "#08979c",
    "#531dab",
]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Password = Annotated[str, StringConstraints(min_length=8, max_length=128)]


def initials_for(name: str) -> str:
    parts = [p for p in name.replace("(", " ").replace(")", " ").split() if p]
    return "".join(p[0] for p in parts[:2]).upper() or "?"


def color_for(name: str) -> str:
    return PALETTE[int(hashlib.sha256(name.lower().encode()).hexdigest(), 16) % len(PALETTE)]


async def require_admin(user: CurrentUser) -> User:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admins only")
    return user


Admin = Annotated[User, Depends(require_admin)]


# ---------- users ----------
class UserCreate(BaseModel):
    email: Email
    name: Name
    password: Password
    is_admin: bool = False


class UserUpdate(BaseModel):
    name: Name | None = None
    is_admin: bool | None = None
    password: Password | None = None


async def _create_user(email: str, name: str, password: str, is_admin: bool) -> User:
    try:
        return await User.create(
            email=email,
            name=name,
            initials=initials_for(name),
            color=color_for(name),
            password_hash=hash_password(password),
            is_admin=is_admin,
        )
    except IntegrityError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "A user with this e-mail already exists") from exc


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(payload: UserCreate, _: Admin) -> UserOut:
    if await User.exists(email=payload.email):
        raise HTTPException(status.HTTP_409_CONFLICT, "A user with this e-mail already exists")
    return UserOut.model_validate(await _create_user(payload.email, payload.name, payload.password, payload.is_admin))


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(user_id: int, payload: UserUpdate, admin: Admin) -> UserOut:
    user = await User.get_or_none(id=user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    changed: list[str] = []
    if payload.name is not None:
        user.name = payload.name
        user.initials = initials_for(payload.name)
        changed += ["name", "initials"]
    if payload.is_admin is not None:
        if user.id == admin.id and not payload.is_admin:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot remove your own admin rights")
        user.is_admin = payload.is_admin
        changed.append("is_admin")
    if payload.password is not None:
        user.password_hash = hash_password(payload.password)
        changed.append("password_hash")
    if changed:
        await user.save(update_fields=changed)
    return UserOut.model_validate(user)


# ---------- invites ----------
class InviteCreate(BaseModel):
    email: Email | None = None
    name: Name | None = None
    board_id: int | None = None
    expires_in_days: int = Field(default=7, ge=1, le=30)
    max_uses: int = Field(default=1, ge=1, le=100)


class InviteOut(BaseModel):
    id: int
    email: str | None
    name: str | None
    board_id: int | None
    board_title: str | None
    created_by: UserOut
    created_at: datetime
    expires_at: datetime
    max_uses: int
    uses: int
    revoked: bool
    url: str | None = None


class InviteInfo(BaseModel):
    valid: bool
    reason: str | None
    email: str | None
    name: str | None
    board_id: int | None
    board_title: str | None
    invited_by: str


class InviteAccept(BaseModel):
    name: Name
    email: Email
    password: Password


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _invite_url(token: str) -> str:
    return f"{get_settings().effective_frontend_url}/invite/{token}"


def _invite_out(invite: Invite, url: str | None = None) -> InviteOut:
    board = invite.board  # prefetched
    return InviteOut(
        id=invite.id,
        email=invite.email,
        name=invite.name,
        board_id=board.id if board else None,
        board_title=board.title if board else None,
        created_by=UserOut.model_validate(invite.created_by),
        created_at=invite.created_at,
        expires_at=invite.expires_at,
        max_uses=invite.max_uses,
        uses=invite.uses,
        revoked=invite.revoked,
        url=url,
    )


def _invalid_reason(invite: Invite | None) -> str | None:
    if invite is None:
        return "This invite link does not exist."
    if invite.revoked:
        return "This invite was revoked."
    if invite.expires_at < datetime.now(UTC):
        return "This invite has expired."
    if invite.uses >= invite.max_uses:
        return "This invite has already been used."
    return None


@router.post("/invites", response_model=InviteOut, status_code=status.HTTP_201_CREATED)
async def create_invite(payload: InviteCreate, admin: Admin) -> InviteOut:
    if payload.board_id is not None and not await Board.exists(id=payload.board_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Board not found")
    if payload.email is not None and await User.exists(email=payload.email):
        raise HTTPException(status.HTTP_409_CONFLICT, "A user with this e-mail already exists")
    token = secrets.token_urlsafe(24)
    invite = await Invite.create(
        token_hash=_hash(token),
        email=payload.email,
        name=payload.name,
        board_id=payload.board_id,
        created_by=admin,
        expires_at=datetime.now(UTC) + timedelta(days=payload.expires_in_days),
        max_uses=payload.max_uses,
    )
    await invite.fetch_related("board", "created_by")
    return _invite_out(invite, _invite_url(token))


@router.get("/invites", response_model=list[InviteOut])
async def list_invites(_: Admin) -> list[InviteOut]:
    invites = await Invite.all().order_by("-created_at", "-id").prefetch_related("board", "created_by")
    return [_invite_out(i) for i in invites]


@router.delete("/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_invite(invite_id: int, _: Admin) -> Response:
    if not await Invite.filter(id=invite_id).update(revoked=True):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invite not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/invites/{token}/info", response_model=InviteInfo)
async def invite_info(token: str) -> InviteInfo:
    invite = await Invite.get_or_none(token_hash=_hash(token)).prefetch_related("board", "created_by")
    reason = _invalid_reason(invite)
    if invite is None:
        return InviteInfo(valid=False, reason=reason, email=None, name=None, board_id=None, board_title=None, invited_by="")
    return InviteInfo(
        valid=reason is None,
        reason=reason,
        email=invite.email,
        name=invite.name,
        board_id=invite.board.id if invite.board else None,
        board_title=invite.board.title if invite.board else None,
        invited_by=invite.created_by.name,
    )


@router.post("/invites/{token}/accept", response_model=TokenOut)
async def accept_invite(token: str, payload: InviteAccept) -> TokenOut:
    invite = await Invite.get_or_none(token_hash=_hash(token)).prefetch_related("board")
    reason = _invalid_reason(invite)
    if invite is None or reason is not None:
        raise HTTPException(status.HTTP_410_GONE, reason)
    if invite.email is not None and payload.email != invite.email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This invite is for a different e-mail address")
    if await User.exists(email=payload.email):
        raise HTTPException(status.HTTP_409_CONFLICT, "A user with this e-mail already exists - log in instead")
    async with in_transaction():
        # Atomic use counter: a multi-use invite can be accepted concurrently.
        claimed = await Invite.filter(id=invite.id, revoked=False, uses=invite.uses).update(uses=invite.uses + 1)
        if not claimed:
            raise HTTPException(status.HTTP_410_GONE, "This invite was just used; please try again or ask for a new link")
        user = await _create_user(payload.email, payload.name, payload.password, False)
        if invite.board is not None:
            await invite.board.members.add(user)
    if invite.board is not None:
        await hub.board_updated(invite.board.id, "members.updated", user.id, invite.board.id)
        await hub.boards_changed(invite.board.id, "members.updated", user.id)
    return TokenOut(access_token=create_access_token(user.id), user=UserOut.model_validate(user))
