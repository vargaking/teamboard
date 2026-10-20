from fastapi import APIRouter, Response, status
from tortoise.transactions import in_transaction

from app.core.deps import CurrentUser
from app.models import Column
from app.realtime import hub
from app.schemas import ColumnOut, ColumnUpdate
from app.services import get_column_checked, load_board, serialize_board

router = APIRouter(prefix="/columns", tags=["columns"])


@router.patch("/{column_id}", response_model=ColumnOut)
async def update_column(column_id: int, payload: ColumnUpdate, user: CurrentUser) -> ColumnOut:
    column = await get_column_checked(user, column_id)
    column.title = payload.title
    await column.save(update_fields=["title"])
    await hub.board_updated(column.board_id, "column.updated", user.id, column_id)  # type: ignore[attr-defined]
    board = await load_board(column.board_id)  # type: ignore[attr-defined]
    assert board is not None
    detail = serialize_board(board)
    return next(c for c in detail.columns if c.id == column_id)


@router.delete("/{column_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_column(column_id: int, user: CurrentUser) -> Response:
    column = await get_column_checked(user, column_id)
    board_id: int = column.board_id  # type: ignore[attr-defined]
    async with in_transaction():
        await column.delete()  # cascades to cards
        remaining = await Column.filter(board_id=board_id).order_by("position", "id")
        for index, col in enumerate(remaining):
            if col.position != index:
                await Column.filter(id=col.id).update(position=index)
    await hub.board_updated(board_id, "column.deleted", user.id, column_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
