from fastapi import APIRouter, HTTPException, Response, status
from tortoise.transactions import in_transaction

from app.core.deps import CurrentUser
from app.models import Card, Column, Comment
from app.realtime import hub
from app.schemas import BoardDetail, CardCreate, CardMove, CardOut, CardUpdate, CommentCreate, CommentOut
from app.services import (
    board_detail_or_404,
    get_card_checked,
    get_column_checked,
    load_card,
    renumber_column,
    serialize_card,
    validate_assignees,
    validate_labels,
)

router = APIRouter(tags=["cards"])


async def _card_out(card_id: int) -> CardOut:
    card = await load_card(card_id)
    assert card is not None
    return serialize_card(card)


@router.post("/columns/{column_id}/cards", response_model=CardOut, status_code=status.HTTP_201_CREATED)
async def create_card(column_id: int, payload: CardCreate, user: CurrentUser) -> CardOut:
    column = await get_column_checked(user, column_id)
    board_id: int = column.board_id  # type: ignore[attr-defined]
    assignees = await validate_assignees(board_id, payload.assignee_ids)
    reviewers = await validate_assignees(board_id, payload.reviewer_ids)
    labels = await validate_labels(board_id, payload.label_ids)
    async with in_transaction():
        position = await Card.filter(column_id=column_id).count()
        card = await Card.create(
            column_id=column_id,
            title=payload.title,
            description=payload.description,
            position=position,
            due_date=payload.due_date,
            created_by=user,
        )
        if assignees:
            await card.assignees.add(*assignees)
        if reviewers:
            await card.reviewers.add(*reviewers)
        if labels:
            await card.labels.add(*labels)
    await hub.board_updated(board_id, "card.created", user.id, card.id)
    return await _card_out(card.id)


@router.patch("/cards/{card_id}", response_model=CardOut)
async def update_card(card_id: int, payload: CardUpdate, user: CurrentUser) -> CardOut:
    card, column = await get_card_checked(user, card_id)
    board_id: int = column.board_id  # type: ignore[attr-defined]
    changed: list[str] = []
    if payload.title is not None:
        card.title = payload.title
        changed.append("title")
    if payload.description is not None:
        card.description = payload.description
        changed.append("description")
    if "due_date" in payload.model_fields_set:  # explicit null clears the date
        card.due_date = payload.due_date
        changed.append("due_date")
    assignees = await validate_assignees(board_id, payload.assignee_ids) if payload.assignee_ids is not None else None
    reviewers = await validate_assignees(board_id, payload.reviewer_ids) if payload.reviewer_ids is not None else None
    labels = await validate_labels(board_id, payload.label_ids) if payload.label_ids is not None else None
    async with in_transaction():
        if changed:
            await card.save(update_fields=[*changed, "updated_at"])
        if assignees is not None:
            await card.assignees.clear()
            if assignees:
                await card.assignees.add(*assignees)
        if reviewers is not None:
            await card.reviewers.clear()
            if reviewers:
                await card.reviewers.add(*reviewers)
        if labels is not None:
            await card.labels.clear()
            if labels:
                await card.labels.add(*labels)
    await hub.board_updated(board_id, "card.updated", user.id, card_id)
    return await _card_out(card_id)


@router.post("/cards/{card_id}/move", response_model=BoardDetail)
async def move_card(card_id: int, payload: CardMove, user: CurrentUser) -> BoardDetail:
    card, source = await get_card_checked(user, card_id)
    board_id: int = source.board_id  # type: ignore[attr-defined]
    target = await Column.get_or_none(id=payload.column_id)
    if target is None or target.board_id != board_id:  # type: ignore[attr-defined]
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Target column must belong to the same board")

    async with in_transaction():
        if target.id == source.id:
            ordered = [c for c in await Card.filter(column_id=target.id).order_by("position", "id") if c.id != card.id]
        else:
            ordered = list(await Card.filter(column_id=target.id).order_by("position", "id"))
        index = min(payload.position, len(ordered))
        ordered.insert(index, card)
        for new_position, c in enumerate(ordered):
            if c.id == card.id:
                await Card.filter(id=card.id).update(column_id=target.id, position=new_position)
            elif c.position != new_position:
                await Card.filter(id=c.id).update(position=new_position)
        if target.id != source.id:
            await renumber_column(source.id)
    await hub.board_updated(board_id, "card.moved", user.id, card_id)
    return await board_detail_or_404(board_id)


@router.delete("/cards/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_card(card_id: int, user: CurrentUser) -> Response:
    card, column = await get_card_checked(user, card_id)
    async with in_transaction():
        await card.delete()
        await renumber_column(column.id)
    await hub.board_updated(column.board_id, "card.deleted", user.id, card_id)  # type: ignore[attr-defined]
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- comments ----------
@router.get("/cards/{card_id}/comments", response_model=list[CommentOut])
async def list_comments(card_id: int, user: CurrentUser) -> list[CommentOut]:
    await get_card_checked(user, card_id)
    comments = await Comment.filter(card_id=card_id).order_by("created_at", "id").prefetch_related("author")
    return [CommentOut.model_validate(c) for c in comments]


@router.post("/cards/{card_id}/comments", response_model=CommentOut, status_code=status.HTTP_201_CREATED)
async def create_comment(card_id: int, payload: CommentCreate, user: CurrentUser) -> CommentOut:
    _, column = await get_card_checked(user, card_id)
    comment = await Comment.create(card_id=card_id, author=user, body=payload.body)
    await comment.fetch_related("author")
    await hub.board_updated(column.board_id, "comment.created", user.id, card_id)  # type: ignore[attr-defined]
    return CommentOut.model_validate(comment)


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(comment_id: int, user: CurrentUser) -> Response:
    comment = await Comment.get_or_none(id=comment_id)
    if comment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found")
    card_id: int = comment.card_id  # type: ignore[attr-defined]
    _, column = await get_card_checked(user, card_id)
    if not (user.is_admin or comment.author_id == user.id):  # type: ignore[attr-defined]
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the author or an admin may delete this comment")
    await comment.delete()
    await hub.board_updated(column.board_id, "comment.deleted", user.id, card_id)  # type: ignore[attr-defined]
    return Response(status_code=status.HTTP_204_NO_CONTENT)
