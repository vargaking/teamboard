"""Shared query helpers: loading fully-populated boards/cards and checking access."""

from fastapi import HTTPException, status
from tortoise.functions import Count
from tortoise.query_utils import Prefetch

from app.models import Board, Card, Column, Label, User
from app.schemas import BoardDetail, BoardSummary, CardOut, ColumnOut, LabelOut, UserOut


def _card_queryset():
    return (
        Card.all().annotate(comment_count=Count("comments")).prefetch_related("assignees", "reviewers", "labels").order_by("position", "id")
    )


def serialize_card(card: Card) -> CardOut:
    return CardOut(
        id=card.id,
        column_id=card.column_id,  # type: ignore[attr-defined]
        title=card.title,
        description=card.description,
        position=card.position,
        due_date=card.due_date,
        assignees=[UserOut.model_validate(u) for u in card.assignees],
        reviewers=[UserOut.model_validate(u) for u in card.reviewers],
        labels=[LabelOut.model_validate(label) for label in card.labels],
        comment_count=int(getattr(card, "comment_count", 0) or 0),
        created_by=card.created_by_id,  # type: ignore[attr-defined]
        created_at=card.created_at,
        updated_at=card.updated_at,
    )


async def load_card(card_id: int) -> Card | None:
    return await _card_queryset().get_or_none(id=card_id)


async def load_board(board_id: int) -> Board | None:
    return (
        await Board.filter(id=board_id)
        .prefetch_related(
            "members",
            "labels",
            Prefetch(
                "columns", queryset=Column.all().order_by("position", "id").prefetch_related(Prefetch("cards", queryset=_card_queryset()))
            ),
        )
        .first()
    )


def serialize_board(board: Board) -> BoardDetail:
    return BoardDetail(
        id=board.id,
        title=board.title,
        description=board.description,
        owner_id=board.owner_id,  # type: ignore[attr-defined]
        members=[UserOut.model_validate(u) for u in sorted(board.members, key=lambda u: u.name.lower())],
        labels=[LabelOut.model_validate(label) for label in sorted(board.labels, key=lambda lab: lab.id)],
        columns=[
            ColumnOut(
                id=col.id,
                board_id=col.board_id,  # type: ignore[attr-defined]
                title=col.title,
                position=col.position,
                cards=[serialize_card(c) for c in col.cards],
            )
            for col in board.columns
        ],
        created_at=board.created_at,
    )


def serialize_board_summary(board: Board) -> BoardSummary:
    return BoardSummary(
        id=board.id,
        title=board.title,
        description=board.description,
        owner_id=board.owner_id,  # type: ignore[attr-defined]
        member_ids=sorted(u.id for u in board.members),
        created_at=board.created_at,
    )


async def board_detail_or_404(board_id: int) -> BoardDetail:
    board = await load_board(board_id)
    if board is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Board not found")
    return serialize_board(board)


async def can_access_board(user: User, board_id: int) -> bool:
    if user.is_admin:
        return await Board.exists(id=board_id)
    return await Board.exists(id=board_id, members__id=user.id)


async def require_board_access(user: User, board_id: int) -> None:
    """404 if the board does not exist, 403 if the user is not a member (admins always pass)."""
    if not await Board.exists(id=board_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Board not found")
    if not await can_access_board(user, board_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You are not a member of this board")


async def get_column_checked(user: User, column_id: int) -> Column:
    column = await Column.get_or_none(id=column_id)
    if column is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Column not found")
    await require_board_access(user, column.board_id)  # type: ignore[attr-defined]
    return column


async def get_card_checked(user: User, card_id: int) -> tuple[Card, Column]:
    card = await Card.get_or_none(id=card_id)
    if card is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
    column = await get_column_checked(user, card.column_id)  # type: ignore[attr-defined]
    return card, column


async def get_label_checked(user: User, label_id: int) -> Label:
    label = await Label.get_or_none(id=label_id)
    if label is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Label not found")
    await require_board_access(user, label.board_id)  # type: ignore[attr-defined]
    return label


async def validate_assignees(board_id: int, user_ids: list[int]) -> list[User]:
    """Assignees and reviewers must be members of the board."""
    unique = list(dict.fromkeys(user_ids))
    if not unique:
        return []
    users = await User.filter(id__in=unique, boards__id=board_id)
    if len(users) != len(unique):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "All assignees and reviewers must be members of this board")
    return users


async def validate_labels(board_id: int, label_ids: list[int]) -> list[Label]:
    unique = list(dict.fromkeys(label_ids))
    if not unique:
        return []
    labels = await Label.filter(id__in=unique, board_id=board_id)
    if len(labels) != len(unique):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "All labels must belong to this board")
    return labels


async def renumber_column(column_id: int) -> None:
    """Make card positions in a column 0..n-1 in current order."""
    cards = await Card.filter(column_id=column_id).order_by("position", "id")
    for index, card in enumerate(cards):
        if card.position != index:
            # queryset update: does not bump `updated_at` (a reorder is not an edit)
            await Card.filter(id=card.id).update(position=index)
