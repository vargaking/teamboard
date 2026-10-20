from fastapi import APIRouter, HTTPException, Response, status
from tortoise.transactions import in_transaction

from app.core.deps import CurrentUser
from app.models import Board, Column, Label, User
from app.realtime import hub
from app.schemas import (
    BoardCreate,
    BoardDetail,
    BoardMembersIn,
    BoardSummary,
    BoardUpdate,
    ColumnCreate,
    ColumnOrder,
    ColumnOut,
    LabelCreate,
    LabelOut,
    LabelUpdate,
)
from app.services import board_detail_or_404, get_label_checked, require_board_access, serialize_board_summary

router = APIRouter(tags=["boards"])

DEFAULT_COLUMNS = ["To do", "In progress", "Review", "Done"]


async def _get_board_checked(user: User, board_id: int) -> Board:
    await require_board_access(user, board_id)
    return await Board.get(id=board_id)


def _require_owner_or_admin(user: User, board: Board) -> None:
    if not (user.is_admin or board.owner_id == user.id):  # type: ignore[attr-defined]
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the board owner or an admin may do this")


# ---------- boards ----------
@router.get("/boards", response_model=list[BoardSummary])
async def list_boards(user: CurrentUser) -> list[BoardSummary]:
    qs = Board.all() if user.is_admin else Board.filter(members__id=user.id)
    boards = await qs.distinct().order_by("-created_at", "-id").prefetch_related("members")
    return [serialize_board_summary(b) for b in boards]


@router.post("/boards", response_model=BoardDetail, status_code=status.HTTP_201_CREATED)
async def create_board(payload: BoardCreate, user: CurrentUser) -> BoardDetail:
    async with in_transaction():
        board = await Board.create(title=payload.title, description=payload.description, owner=user)
        await board.members.add(user)
        for index, title in enumerate(DEFAULT_COLUMNS):
            await Column.create(board=board, title=title, position=index)
    await hub.boards_changed(board.id, "board.created", user.id)
    return await board_detail_or_404(board.id)


@router.get("/boards/{board_id}", response_model=BoardDetail)
async def get_board(board_id: int, user: CurrentUser) -> BoardDetail:
    await require_board_access(user, board_id)
    return await board_detail_or_404(board_id)


@router.patch("/boards/{board_id}", response_model=BoardDetail)
async def update_board(board_id: int, payload: BoardUpdate, user: CurrentUser) -> BoardDetail:
    board = await _get_board_checked(user, board_id)
    changed: list[str] = []
    if payload.title is not None:
        board.title = payload.title
        changed.append("title")
    if payload.description is not None:
        board.description = payload.description
        changed.append("description")
    if changed:
        await board.save(update_fields=changed)
        await hub.board_updated(board_id, "board.updated", user.id, board_id)
        await hub.boards_changed(board_id, "board.updated", user.id)
    return await board_detail_or_404(board_id)


@router.delete("/boards/{board_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_board(board_id: int, user: CurrentUser) -> Response:
    board = await _get_board_checked(user, board_id)
    _require_owner_or_admin(user, board)
    await board.delete()
    await hub.board_deleted(board_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/boards/{board_id}/members", response_model=BoardDetail)
async def set_members(board_id: int, payload: BoardMembersIn, user: CurrentUser) -> BoardDetail:
    board = await _get_board_checked(user, board_id)
    wanted = set(payload.user_ids) | {board.owner_id}  # type: ignore[attr-defined]
    users = await User.filter(id__in=list(wanted))
    if len(users) != len(wanted):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "One or more user ids do not exist")
    async with in_transaction():
        await board.members.clear()
        await board.members.add(*users)
        # Users removed from the board must not stay assigned to its cards.
        for column in await Column.filter(board_id=board_id).prefetch_related("cards__assignees"):
            for card in column.cards:
                stale = [u for u in card.assignees if u.id not in wanted]
                if stale:
                    await card.assignees.remove(*stale)
    await hub.board_updated(board_id, "members.updated", user.id, board_id)
    await hub.boards_changed(board_id, "members.updated", user.id)
    return await board_detail_or_404(board_id)


# ---------- labels ----------
@router.post("/boards/{board_id}/labels", response_model=LabelOut, status_code=status.HTTP_201_CREATED)
async def create_label(board_id: int, payload: LabelCreate, user: CurrentUser) -> LabelOut:
    await require_board_access(user, board_id)
    label = await Label.create(board_id=board_id, name=payload.name, color=payload.color.lower())
    await hub.board_updated(board_id, "label.changed", user.id, label.id)
    return LabelOut.model_validate(label)


@router.patch("/labels/{label_id}", response_model=LabelOut)
async def update_label(label_id: int, payload: LabelUpdate, user: CurrentUser) -> LabelOut:
    label = await get_label_checked(user, label_id)
    changed: list[str] = []
    if payload.name is not None:
        label.name = payload.name
        changed.append("name")
    if payload.color is not None:
        label.color = payload.color.lower()
        changed.append("color")
    if changed:
        await label.save(update_fields=changed)
        await hub.board_updated(label.board_id, "label.changed", user.id, label.id)  # type: ignore[attr-defined]
    return LabelOut.model_validate(label)


@router.delete("/labels/{label_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_label(label_id: int, user: CurrentUser) -> Response:
    label = await get_label_checked(user, label_id)
    board_id: int = label.board_id  # type: ignore[attr-defined]
    await label.delete()
    await hub.board_updated(board_id, "label.changed", user.id, label_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- columns (board-scoped endpoints) ----------
@router.post("/boards/{board_id}/columns", response_model=ColumnOut, status_code=status.HTTP_201_CREATED)
async def create_column(board_id: int, payload: ColumnCreate, user: CurrentUser) -> ColumnOut:
    await require_board_access(user, board_id)
    count = await Column.filter(board_id=board_id).count()
    column = await Column.create(board_id=board_id, title=payload.title, position=count)
    await hub.board_updated(board_id, "column.created", user.id, column.id)
    return ColumnOut(id=column.id, board_id=board_id, title=column.title, position=column.position, cards=[])


@router.put("/boards/{board_id}/columns/order", response_model=BoardDetail)
async def reorder_columns(board_id: int, payload: ColumnOrder, user: CurrentUser) -> BoardDetail:
    await require_board_access(user, board_id)
    existing = {c.id for c in await Column.filter(board_id=board_id).only("id")}
    if len(payload.column_ids) != len(set(payload.column_ids)) or set(payload.column_ids) != existing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "column_ids must contain each column of this board exactly once")
    async with in_transaction():
        for index, column_id in enumerate(payload.column_ids):
            await Column.filter(id=column_id).update(position=index)
    await hub.board_updated(board_id, "column.reordered", user.id, board_id)
    return await board_detail_or_404(board_id)
