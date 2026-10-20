"""The TeamBoard MCP server: tools Claude can call, acting as the user whose token is on the request.

Every tool resolves the current user from the bearer token (OAuth access token or personal token) and then
goes through the same access checks and services as the REST API, so Claude can never see or change more
than the user could in the UI. Mutations broadcast the same live-update events as the UI.
"""

from datetime import date
from typing import Annotated, Any

from fastapi import HTTPException
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.settings import AuthSettings, ClientRegistrationOptions, RevocationOptions
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from pydantic import AnyHttpUrl, Field
from tortoise.transactions import in_transaction

from app.mcp.oauth import SCOPE, TeamBoardTokenVerifier, issuer_url, mcp_url
from app.models import Board, Card, Column, Comment, User
from app.realtime import hub
from app.schemas import BoardDetail, CardOut
from app.services import (
    board_detail_or_404,
    get_card_checked,
    get_column_checked,
    load_card,
    renumber_column,
    require_board_access,
    serialize_card,
    validate_assignees,
    validate_labels,
)


class McpError(ToolError):
    """Anticipated failure inside a tool: the SDK returns the message to the model as a tool error."""


async def current_user() -> User:
    token = get_access_token()
    if token is None or token.subject is None:
        raise McpError("Not authenticated")
    user = await User.get_or_none(id=int(token.subject))
    if user is None:
        raise McpError("The user behind this token no longer exists")
    return user


def _guard(exc: HTTPException) -> McpError:
    return McpError(str(exc.detail))


def _user(u: Any) -> dict[str, Any]:
    return {"id": u.id, "name": u.name, "email": u.email}


def _card(card: CardOut, column_title: str | None = None) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": card.id,
        "title": card.title,
        "description": card.description,
        "column_id": card.column_id,
        "position": card.position,
        "due_date": card.due_date.isoformat() if card.due_date else None,
        "labels": [{"id": lab.id, "name": lab.name} for lab in card.labels],
        "assignees": [_user(u) for u in card.assignees],
        "reviewers": [_user(u) for u in card.reviewers],
        "comment_count": card.comment_count,
        "updated_at": card.updated_at.isoformat(),
    }
    if column_title is not None:
        out["column"] = column_title
    return out


def _board(board: BoardDetail) -> dict[str, Any]:
    return {
        "id": board.id,
        "title": board.title,
        "description": board.description,
        "members": [_user(u) for u in board.members],
        "labels": [{"id": lab.id, "name": lab.name, "color": lab.color} for lab in board.labels],
        "columns": [
            {"id": col.id, "title": col.title, "position": col.position, "cards": [_card(c) for c in col.cards]} for col in board.columns
        ],
    }


def build_server() -> MCPServer:
    auth = AuthSettings(
        issuer_url=AnyHttpUrl(issuer_url()),
        resource_server_url=AnyHttpUrl(mcp_url()),
        client_registration_options=ClientRegistrationOptions(enabled=True, valid_scopes=[SCOPE], default_scopes=[SCOPE]),
        revocation_options=RevocationOptions(enabled=True),
        required_scopes=[],
        validate_token_resource=True,  # refuse tokens issued for another resource URL
    )
    server = MCPServer(
        name="TeamBoard",
        instructions=(
            "TeamBoard is the team's kanban board. Card ids, column ids and board ids are integers; always call list_boards "
            "or get_board first to learn them. Positions are 0-based within a column. Dates are YYYY-MM-DD. "
            "You act as the user who authorized this connection: you only see boards they are a member of."
        ),
        auth=auth,
        token_verifier=TeamBoardTokenVerifier(),
        # The OAuth endpoints are mounted separately under /api/oauth (see app/mcp/mount.py).
    )

    # ---------- read ----------
    @server.tool(description="List the boards the current user can see, with member names and column titles.")
    async def list_boards() -> list[dict[str, Any]]:
        user = await current_user()
        qs = Board.all() if user.is_admin else Board.filter(members__id=user.id)
        boards = await qs.distinct().order_by("-created_at", "-id").prefetch_related("members", "columns")
        return [
            {
                "id": b.id,
                "title": b.title,
                "description": b.description,
                "members": [u.name for u in b.members],
                "columns": [{"id": c.id, "title": c.title} for c in sorted(b.columns, key=lambda c: (c.position, c.id))],
            }
            for b in boards
        ]

    @server.tool(
        description="Get a whole board: columns in order, each with its cards (title, description, due date, labels, assignees, reviewers)."
    )
    async def get_board(board_id: int) -> dict[str, Any]:
        user = await current_user()
        try:
            await require_board_access(user, board_id)
            return _board(await board_detail_or_404(board_id))
        except HTTPException as exc:
            raise _guard(exc) from exc

    @server.tool(description="Get one card with its comments.")
    async def get_card(card_id: int) -> dict[str, Any]:
        user = await current_user()
        try:
            _, column = await get_card_checked(user, card_id)
        except HTTPException as exc:
            raise _guard(exc) from exc
        card = await load_card(card_id)
        assert card is not None
        comments = await Comment.filter(card_id=card_id).order_by("created_at", "id").prefetch_related("author")
        out = _card(serialize_card(card), column.title)
        out["board_id"] = column.board_id  # type: ignore[attr-defined]
        out["comments"] = [{"id": c.id, "author": c.author.name, "body": c.body, "created_at": c.created_at.isoformat()} for c in comments]
        return out

    @server.tool(
        description=(
            "Search cards across the user's boards (or one board). Filters are ANDed: text matches title/description "
            "(case-insensitive), assignee/reviewer by user id or 'me', overdue=true for past-due cards not in a 'Done' column."
        )
    )
    async def search_cards(
        text: str | None = None,
        board_id: int | None = None,
        assignee: Annotated[str | None, Field(description="user id or 'me'")] = None,
        reviewer: Annotated[str | None, Field(description="user id or 'me'")] = None,
        overdue: bool = False,
        limit: Annotated[int, Field(ge=1, le=200)] = 50,
    ) -> list[dict[str, Any]]:
        user = await current_user()
        board_qs = Board.all() if user.is_admin else Board.filter(members__id=user.id)
        if board_id is not None:
            board_qs = board_qs.filter(id=board_id)
        board_ids = [b.id for b in await board_qs.distinct().only("id")]
        qs = Card.filter(column__board_id__in=board_ids)
        if text:
            from tortoise.expressions import Q

            qs = qs.filter(Q(title__icontains=text) | Q(description__icontains=text))
        if assignee:
            qs = qs.filter(assignees__id=user.id if assignee == "me" else int(assignee))
        if reviewer:
            qs = qs.filter(reviewers__id=user.id if reviewer == "me" else int(reviewer))
        if overdue:
            qs = qs.filter(due_date__lt=date.today()).exclude(column__title__icontains="done")
        from tortoise.functions import Count

        cards = (
            await qs.distinct()
            .annotate(comment_count=Count("comments"))
            .prefetch_related("assignees", "reviewers", "labels", "column")
            .order_by("due_date", "id")
            .limit(limit)
        )
        return [
            {**_card(serialize_card(c), c.column.title), "board_id": c.column.board_id}  # type: ignore[attr-defined]
            for c in cards
        ]

    @server.tool(description="List all team members (id, name, email).")
    async def list_users() -> list[dict[str, Any]]:
        await current_user()
        return [_user(u) for u in await User.all().order_by("name", "id")]

    # ---------- write ----------
    @server.tool(
        description="Create a card at the end of a column. Assignees/reviewers must be board members; labels must belong to the board."
    )
    async def create_card(
        column_id: int,
        title: str,
        description: str = "",
        due_date: Annotated[str | None, Field(description="YYYY-MM-DD")] = None,
        assignee_ids: list[int] | None = None,
        reviewer_ids: list[int] | None = None,
        label_ids: list[int] | None = None,
    ) -> dict[str, Any]:
        user = await current_user()
        try:
            column = await get_column_checked(user, column_id)
            board_id: int = column.board_id  # type: ignore[attr-defined]
            assignees = await validate_assignees(board_id, assignee_ids or [])
            reviewers = await validate_assignees(board_id, reviewer_ids or [])
            labels = await validate_labels(board_id, label_ids or [])
        except HTTPException as exc:
            raise _guard(exc) from exc
        if not title.strip():
            raise McpError("title must not be empty")
        async with in_transaction():
            card = await Card.create(
                column_id=column_id,
                title=title.strip()[:300],
                description=description,
                position=await Card.filter(column_id=column_id).count(),
                due_date=_parse_date(due_date),
                created_by=user,
            )
            if assignees:
                await card.assignees.add(*assignees)
            if reviewers:
                await card.reviewers.add(*reviewers)
            if labels:
                await card.labels.add(*labels)
        await hub.board_updated(board_id, "card.created", user.id, card.id)
        loaded = await load_card(card.id)
        assert loaded is not None
        return _card(serialize_card(loaded), column.title)

    @server.tool(
        description="Update a card. Omitted fields are unchanged; clear_due_date=true removes the due date; id lists replace the full set."
    )
    async def update_card(
        card_id: int,
        title: str | None = None,
        description: str | None = None,
        due_date: Annotated[str | None, Field(description="YYYY-MM-DD")] = None,
        clear_due_date: bool = False,
        assignee_ids: list[int] | None = None,
        reviewer_ids: list[int] | None = None,
        label_ids: list[int] | None = None,
    ) -> dict[str, Any]:
        user = await current_user()
        try:
            card, column = await get_card_checked(user, card_id)
            board_id: int = column.board_id  # type: ignore[attr-defined]
            assignees = await validate_assignees(board_id, assignee_ids) if assignee_ids is not None else None
            reviewers = await validate_assignees(board_id, reviewer_ids) if reviewer_ids is not None else None
            labels = await validate_labels(board_id, label_ids) if label_ids is not None else None
        except HTTPException as exc:
            raise _guard(exc) from exc
        changed: list[str] = []
        if title is not None:
            if not title.strip():
                raise McpError("title must not be empty")
            card.title = title.strip()[:300]
            changed.append("title")
        if description is not None:
            card.description = description
            changed.append("description")
        if clear_due_date:
            card.due_date = None
            changed.append("due_date")
        elif due_date is not None:
            card.due_date = _parse_date(due_date)
            changed.append("due_date")
        async with in_transaction():
            if changed:
                await card.save(update_fields=[*changed, "updated_at"])
            for relation, values in ((card.assignees, assignees), (card.reviewers, reviewers), (card.labels, labels)):
                if values is not None:
                    await relation.clear()
                    if values:
                        await relation.add(*values)
        await hub.board_updated(board_id, "card.updated", user.id, card_id)
        loaded = await load_card(card_id)
        assert loaded is not None
        return _card(serialize_card(loaded), column.title)

    @server.tool(description="Move a card to a column (same board) at a 0-based position; omit position to append at the end.")
    async def move_card(card_id: int, column_id: int, position: int | None = None) -> dict[str, Any]:
        user = await current_user()
        try:
            card, source = await get_card_checked(user, card_id)
        except HTTPException as exc:
            raise _guard(exc) from exc
        board_id: int = source.board_id  # type: ignore[attr-defined]
        target = await Column.get_or_none(id=column_id)
        if target is None or target.board_id != board_id:  # type: ignore[attr-defined]
            raise McpError("Target column must belong to the same board")
        async with in_transaction():
            ordered = [c for c in await Card.filter(column_id=target.id).order_by("position", "id") if c.id != card.id]
            index = len(ordered) if position is None else max(0, min(position, len(ordered)))
            ordered.insert(index, card)
            for new_position, c in enumerate(ordered):
                if c.id == card.id:
                    await Card.filter(id=card.id).update(column_id=target.id, position=new_position)
                elif c.position != new_position:
                    await Card.filter(id=c.id).update(position=new_position)
            if target.id != source.id:
                await renumber_column(source.id)
        await hub.board_updated(board_id, "card.moved", user.id, card_id)
        return {"card_id": card_id, "column": target.title, "column_id": target.id, "position": index}

    @server.tool(description="Add a comment to a card as the current user.")
    async def add_comment(card_id: int, body: str) -> dict[str, Any]:
        user = await current_user()
        try:
            _, column = await get_card_checked(user, card_id)
        except HTTPException as exc:
            raise _guard(exc) from exc
        if not body.strip():
            raise McpError("body must not be empty")
        comment = await Comment.create(card_id=card_id, author=user, body=body.strip()[:5000])
        await hub.board_updated(column.board_id, "comment.created", user.id, card_id)  # type: ignore[attr-defined]
        return {
            "id": comment.id,
            "card_id": card_id,
            "author": user.name,
            "body": comment.body,
            "created_at": comment.created_at.isoformat(),
        }

    @server.tool(description="Create a column at the end of a board.")
    async def create_column(board_id: int, title: str) -> dict[str, Any]:
        user = await current_user()
        try:
            await require_board_access(user, board_id)
        except HTTPException as exc:
            raise _guard(exc) from exc
        if not title.strip():
            raise McpError("title must not be empty")
        column = await Column.create(board_id=board_id, title=title.strip()[:120], position=await Column.filter(board_id=board_id).count())
        await hub.board_updated(board_id, "column.created", user.id, column.id)
        return {"id": column.id, "title": column.title, "position": column.position, "board_id": board_id}

    return server


def _parse_date(value: str | None) -> date | None:
    if value is None or value == "":
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise McpError("due_date must be YYYY-MM-DD") from exc


mcp_server = build_server()
