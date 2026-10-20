from typing import Annotated, Any, Literal

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, Field, StringConstraints, model_validator

from app.ai import providers, service
from app.ai.crypto import decrypt, encrypt
from app.ai.providers import Provider
from app.core.deps import CurrentUser
from app.models import UserAISettings
from app.services import board_detail_or_404, get_card_checked, load_card, require_board_access, serialize_card

router = APIRouter(prefix="/ai", tags=["ai"])


# ---------- schemas ----------
class AISettingsOut(BaseModel):
    provider: Provider | None
    model: str | None
    has_key: bool
    key_hint: str | None


class AISettingsIn(BaseModel):
    provider: Provider
    api_key: Annotated[str, StringConstraints(strip_whitespace=True, min_length=8, max_length=512)] | None = None
    model: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)] | None = None


class AIModelOut(BaseModel):
    id: str
    label: str


class AssistIn(BaseModel):
    action: Literal["describe", "acceptance_criteria", "subtasks", "labels"]
    instructions: Annotated[str, StringConstraints(max_length=2000)] | None = None


class DraftIn(BaseModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20000)]
    column_id: int | None = None


class ChatMessageIn(BaseModel):
    role: Literal["user", "assistant"]
    content: Annotated[str, StringConstraints(min_length=1, max_length=service.MAX_CHAT_CHARS)]


class ChatIn(BaseModel):
    messages: list[ChatMessageIn] = Field(min_length=1, max_length=service.MAX_CHAT_MESSAGES)

    @model_validator(mode="after")
    def _last_is_user(self) -> "ChatIn":
        if self.messages[-1].role != "user":
            raise ValueError("The last message must come from the user")
        return self


def _settings_out(settings: UserAISettings | None) -> AISettingsOut:
    if settings is None:
        return AISettingsOut(provider=None, model=None, has_key=False, key_hint=None)
    return AISettingsOut(provider=settings.provider, model=settings.model, has_key=True, key_hint="…" + settings.key_hint)  # type: ignore[arg-type]


# ---------- settings ----------
@router.get("/settings", response_model=AISettingsOut)
async def get_ai_settings(user: CurrentUser) -> AISettingsOut:
    return _settings_out(await UserAISettings.get_or_none(user_id=user.id))


@router.put("/settings", response_model=AISettingsOut)
async def put_ai_settings(payload: AISettingsIn, user: CurrentUser) -> AISettingsOut:
    settings = await UserAISettings.get_or_none(user_id=user.id)
    if settings is None:
        if payload.api_key is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "An API key is required the first time you configure AI")
        settings = UserAISettings(user_id=user.id, provider=payload.provider, api_key_encrypted="", key_hint="")
    provider_changed = settings.provider != payload.provider
    settings.provider = payload.provider
    if payload.api_key is not None:
        settings.api_key_encrypted = encrypt(payload.api_key)
        settings.key_hint = payload.api_key[-4:]
    elif provider_changed:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Changing the provider requires a new API key")
    if payload.model is not None:
        settings.model = payload.model
    elif provider_changed:
        settings.model = None  # model ids are provider-specific
    await settings.save()
    return _settings_out(settings)


@router.delete("/settings", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ai_settings(user: CurrentUser) -> Response:
    await UserAISettings.filter(user_id=user.id).delete()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


async def _stored_key(user_id: int) -> tuple[UserAISettings, str]:
    settings = await UserAISettings.get_or_none(user_id=user_id)
    if settings is None:
        raise HTTPException(status.HTTP_409_CONFLICT, service.NOT_CONFIGURED)
    api_key = decrypt(settings.api_key_encrypted)
    if api_key is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Your stored API key can no longer be read. Please enter it again in AI settings.")
    return settings, api_key


@router.get("/models", response_model=list[AIModelOut])
async def list_models(user: CurrentUser) -> list[AIModelOut]:
    settings, api_key = await _stored_key(user.id)
    try:
        models = await providers.list_models(settings.provider, api_key)  # type: ignore[arg-type]
    except providers.AIProviderError as exc:
        raise service.provider_error(exc) from exc
    return [AIModelOut(id=m.id, label=m.label) for m in models]


@router.post("/test")
async def test_connection(user: CurrentUser) -> dict[str, Any]:
    creds = await service.credentials_for(user)
    try:
        reply = await providers.complete_text(creds, "Reply with the single word OK.", [{"role": "user", "content": "ping"}], max_tokens=16)
    except providers.AIProviderError as exc:
        raise service.provider_error(exc) from exc
    return {"ok": True, "model": creds.model, "reply": reply[:50]}


# ---------- features ----------
@router.post("/cards/{card_id}/assist")
async def card_assist(card_id: int, payload: AssistIn, user: CurrentUser) -> dict[str, Any]:
    _, column = await get_card_checked(user, card_id)
    creds = await service.credentials_for(user)
    board = await board_detail_or_404(column.board_id)  # type: ignore[attr-defined]
    card = await load_card(card_id)
    assert card is not None
    try:
        return await service.card_assist(creds, board, serialize_card(card), column.title, payload.action, payload.instructions)
    except providers.AIProviderError as exc:
        raise service.provider_error(exc) from exc


@router.post("/boards/{board_id}/summary")
async def board_summary(board_id: int, user: CurrentUser) -> dict[str, str]:
    await require_board_access(user, board_id)
    creds = await service.credentials_for(user)
    board = await board_detail_or_404(board_id)
    try:
        return {"summary": await service.board_summary(creds, board)}
    except providers.AIProviderError as exc:
        raise service.provider_error(exc) from exc


@router.post("/boards/{board_id}/draft-cards")
async def draft_cards(board_id: int, payload: DraftIn, user: CurrentUser) -> dict[str, Any]:
    await require_board_access(user, board_id)
    creds = await service.credentials_for(user)
    board = await board_detail_or_404(board_id)
    if not board.columns:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The board has no columns to put cards in")
    column_ids = {c.id for c in board.columns}
    if payload.column_id is not None and payload.column_id not in column_ids:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "column_id must belong to this board")
    default_column = payload.column_id if payload.column_id is not None else board.columns[0].id
    try:
        return {"cards": await service.draft_cards(creds, board, payload.text, default_column)}
    except providers.AIProviderError as exc:
        raise service.provider_error(exc) from exc


@router.post("/boards/{board_id}/chat")
async def chat(board_id: int, payload: ChatIn, user: CurrentUser) -> dict[str, str]:
    await require_board_access(user, board_id)
    creds = await service.credentials_for(user)
    board = await board_detail_or_404(board_id)
    try:
        reply = await service.chat(creds, board, [m.model_dump() for m in payload.messages], user)
    except providers.AIProviderError as exc:
        raise service.provider_error(exc) from exc
    return {"reply": reply}
