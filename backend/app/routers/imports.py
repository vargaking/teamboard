from typing import Any

from fastapi import APIRouter, Request, status
from fastapi.exceptions import HTTPException
from pydantic import BaseModel, Field

from app.core.deps import CurrentUser
from app.importers import trello
from app.realtime import hub
from app.schemas import BoardDetail
from app.services import board_detail_or_404

router = APIRouter(prefix="/boards/import", tags=["import"])

MAX_BODY_BYTES = 30 * 1024 * 1024


class TrelloPreviewIn(BaseModel):
    export: Any


class TrelloImportOptions(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    include_archived: bool = False
    member_map: dict[str, int] = Field(default_factory=dict)


class TrelloImportIn(BaseModel):
    export: Any
    options: TrelloImportOptions = Field(default_factory=TrelloImportOptions)


def _check_size(request: Request) -> None:
    length = request.headers.get("content-length")
    if length and length.isdigit() and int(length) > MAX_BODY_BYTES:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "The export is larger than 30 MB")


@router.post("/trello/preview")
async def trello_preview(payload: TrelloPreviewIn, request: Request, _: CurrentUser) -> dict[str, Any]:
    _check_size(request)
    return await trello.preview(trello.parse_export(payload.export))


@router.post("/trello", response_model=BoardDetail, status_code=status.HTTP_201_CREATED)
async def trello_import(payload: TrelloImportIn, request: Request, user: CurrentUser) -> BoardDetail:
    _check_size(request)
    export = trello.parse_export(payload.export)
    board_id = await trello.import_board(export, user, payload.options.title, payload.options.include_archived, payload.options.member_map)
    await hub.boards_changed(board_id, "board.created", user.id)
    return await board_detail_or_404(board_id)
