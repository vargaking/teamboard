"""Import a Trello board from its JSON export (Board menu → Print and export → Export as JSON).

Two phases share one parser: `parse_export()` normalises the raw export into plain dataclasses and validates it;
`preview()` summarises it; `import_board()` writes it. Everything Trello-specific lives here.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from typing import Any

from fastapi import HTTPException, status
from tortoise.transactions import in_transaction

from app.models import Board, Card, Column, Comment, Label, User

MAX_CARDS = 5000
MAX_DESCRIPTION = 20000
DEFAULT_LABEL_COLOR = "#8c8c8c"

# Trello colour names (with _light/_dark variants) → hex used on our label chips.
TRELLO_COLORS = {
    "green": "#61bd4f",
    "yellow": "#f2d600",
    "orange": "#ff9f1a",
    "red": "#eb5a46",
    "purple": "#c377e0",
    "blue": "#0079bf",
    "sky": "#00c2e0",
    "lime": "#51e898",
    "pink": "#ff78cb",
    "black": "#344563",
}


@dataclass
class TList:
    id: str
    name: str
    archived: bool
    pos: float


@dataclass
class TLabel:
    id: str
    name: str
    color: str


@dataclass
class TMember:
    id: str
    name: str
    username: str | None
    card_count: int = 0


@dataclass
class TComment:
    member_id: str | None
    member_name: str
    text: str
    created: datetime | None


@dataclass
class TCard:
    id: str
    name: str
    description: str
    list_id: str
    archived: bool
    pos: float
    due: date | None
    label_ids: list[str]
    member_ids: list[str]
    comments: list[TComment] = field(default_factory=list)


@dataclass
class TrelloExport:
    title: str
    description: str
    lists: list[TList]
    cards: list[TCard]
    labels: dict[str, TLabel]
    members: dict[str, TMember]
    checklist_count: int


def _str(value: Any, default: str = "") -> str:
    return value if isinstance(value, str) else default


def _float(value: Any) -> float:
    return float(value) if isinstance(value, int | float) else 0.0


def _parse_due(value: Any) -> date | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
    except ValueError:
        return None


def _parse_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def label_color(trello_color: Any) -> str:
    if not isinstance(trello_color, str) or not trello_color:
        return DEFAULT_LABEL_COLOR
    base = re.sub(r"_(light|dark)$", "", trello_color)
    return TRELLO_COLORS.get(base, DEFAULT_LABEL_COLOR)


def parse_export(raw: Any) -> TrelloExport:
    """Validate and normalise a Trello export. Raises 422 with a readable message if it is not one."""
    if not isinstance(raw, dict) or not isinstance(raw.get("lists"), list) or not isinstance(raw.get("cards"), list):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "This is not a Trello board export (expected 'lists' and 'cards').")
    if len(raw["cards"]) > MAX_CARDS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Too many cards ({len(raw['cards'])}); the limit is {MAX_CARDS}.")

    lists = [
        TList(
            id=_str(item.get("id")),
            name=_str(item.get("name"), "Untitled").strip() or "Untitled",
            archived=bool(item.get("closed")),
            pos=_float(item.get("pos")),
        )
        for item in raw["lists"]
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    ]
    lists.sort(key=lambda item: item.pos)

    labels: dict[str, TLabel] = {}
    for item in raw.get("labels") or []:
        if not isinstance(item, dict) or not isinstance(item.get("id"), str):
            continue
        color_name = _str(item.get("color"))
        name = _str(item.get("name")).strip() or (color_name.replace("_", " ") if color_name else "unnamed")
        labels[item["id"]] = TLabel(id=item["id"], name=name[:60], color=label_color(color_name))

    members: dict[str, TMember] = {}
    for item in raw.get("members") or []:
        if not isinstance(item, dict) or not isinstance(item.get("id"), str):
            continue
        name = _str(item.get("fullName")).strip() or _str(item.get("username")).strip() or "Unknown"
        members[item["id"]] = TMember(id=item["id"], name=name, username=_str(item.get("username")) or None)

    # Checklists are attached to cards by idCard.
    checklists_by_card: dict[str, list[dict[str, Any]]] = {}
    checklist_count = 0
    for item in raw.get("checklists") or []:
        if isinstance(item, dict) and isinstance(item.get("idCard"), str):
            checklists_by_card.setdefault(item["idCard"], []).append(item)
            checklist_count += 1

    # Comments come from the actions log (Trello exports the most recent ~1000 actions).
    comments_by_card: dict[str, list[TComment]] = {}
    for action in raw.get("actions") or []:
        if not isinstance(action, dict) or action.get("type") != "commentCard":
            continue
        data = action.get("data") if isinstance(action.get("data"), dict) else {}
        card_ref = data.get("card") if isinstance(data.get("card"), dict) else {}
        text = _str(data.get("text")).strip()
        card_id = card_ref.get("id")
        if not text or not isinstance(card_id, str):
            continue
        creator = action.get("memberCreator") if isinstance(action.get("memberCreator"), dict) else {}
        member_id = creator.get("id") if isinstance(creator.get("id"), str) else None
        member_name = _str(creator.get("fullName")).strip() or _str(creator.get("username")).strip() or "Unknown"
        comments_by_card.setdefault(card_id, []).append(TComment(member_id, member_name, text, _parse_datetime(action.get("date"))))

    list_ids = {item.id for item in lists}
    cards: list[TCard] = []
    for item in raw["cards"]:
        if not isinstance(item, dict) or not isinstance(item.get("id"), str) or item.get("idList") not in list_ids:
            continue
        description = _str(item.get("desc")).strip()
        description = _append_checklists(description, checklists_by_card.get(item["id"], []))
        description = _append_attachments(description, item.get("attachments"))
        member_ids = [m for m in (item.get("idMembers") or []) if isinstance(m, str) and m in members]
        for m in member_ids:
            members[m].card_count += 1
        card_comments = sorted(
            comments_by_card.get(item["id"], []), key=lambda c: (c.created is None, c.created or datetime.min.replace(tzinfo=UTC))
        )
        cards.append(
            TCard(
                id=item["id"],
                name=(_str(item.get("name")).strip() or "Untitled")[:300],
                description=description[:MAX_DESCRIPTION],
                list_id=item["idList"],
                archived=bool(item.get("closed")),
                pos=_float(item.get("pos")),
                due=_parse_due(item.get("due")),
                label_ids=[lab for lab in (item.get("idLabels") or []) if isinstance(lab, str) and lab in labels],
                member_ids=member_ids,
                comments=card_comments,
            )
        )
    cards.sort(key=lambda card: card.pos)

    return TrelloExport(
        title=(_str(raw.get("name")).strip() or "Imported from Trello")[:200],
        description=_str(raw.get("desc")).strip(),
        lists=lists,
        cards=cards,
        labels=labels,
        members=members,
        checklist_count=checklist_count,
    )


def _append_checklists(description: str, checklists: list[dict[str, Any]]) -> str:
    parts = [description] if description else []
    for checklist in sorted(checklists, key=lambda c: _float(c.get("pos"))):
        items = [i for i in (checklist.get("checkItems") or []) if isinstance(i, dict)]
        if not items:
            continue
        lines = [f"## {_str(checklist.get('name'), 'Checklist').strip() or 'Checklist'}"]
        for entry in sorted(items, key=lambda i: _float(i.get("pos"))):
            box = "[x]" if entry.get("state") == "complete" else "[ ]"
            lines.append(f"- {box} {_str(entry.get('name')).strip()}")
        parts.append("\n".join(lines))
    return "\n\n".join(parts)


def _append_attachments(description: str, attachments: Any) -> str:
    if not isinstance(attachments, list):
        return description
    links = []
    for att in attachments:
        if isinstance(att, dict) and isinstance(att.get("url"), str) and att["url"].startswith(("http://", "https://")):
            name = _str(att.get("name")).strip() or att["url"]
            links.append(f"- [{name}]({att['url']})")
    if not links:
        return description
    block = "## Attachments\n" + "\n".join(links)
    return f"{description}\n\n{block}" if description else block


# ---------- preview ----------
def _normalise(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


async def suggest_users(members: dict[str, TMember]) -> dict[str, int | None]:
    """Match Trello members to users by full name, then by username against the e-mail local part / name."""
    users = await User.all()
    by_name = {_normalise(u.name): u.id for u in users}
    by_local = {_normalise(u.email.split("@")[0]): u.id for u in users}
    suggestions: dict[str, int | None] = {}
    for member in members.values():
        key = _normalise(member.name)
        found = by_name.get(key)
        if found is None and member.username:
            found = by_name.get(_normalise(member.username)) or by_local.get(_normalise(member.username))
        if found is None:
            # first-name match when unique (e.g. "Miki" -> "Miki Petkovic")
            first = _normalise(member.name.split()[0]) if member.name.split() else ""
            candidates = [uid for n, uid in by_name.items() if first and n.startswith(first)]
            found = candidates[0] if len(candidates) == 1 else None
        suggestions[member.id] = found
    return suggestions


async def preview(export: TrelloExport) -> dict[str, Any]:
    suggestions = await suggest_users(export.members)
    cards_per_list: dict[str, int] = {}
    for card in export.cards:
        cards_per_list[card.list_id] = cards_per_list.get(card.list_id, 0) + 1
    return {
        "title": export.title,
        "description": export.description,
        "lists": [{"name": lst.name, "archived": lst.archived, "card_count": cards_per_list.get(lst.id, 0)} for lst in export.lists],
        "card_count": sum(1 for c in export.cards if not c.archived),
        "archived_card_count": sum(1 for c in export.cards if c.archived),
        "label_count": len(export.labels),
        "comment_count": sum(len(c.comments) for c in export.cards),
        "checklist_count": export.checklist_count,
        "members": [
            {
                "trello_id": m.id,
                "trello_name": m.name,
                "trello_username": m.username,
                "card_count": m.card_count,
                "suggested_user_id": suggestions.get(m.id),
            }
            for m in sorted(export.members.values(), key=lambda m: (-m.card_count, m.name.lower()))
        ],
    }


# ---------- import ----------
async def import_board(export: TrelloExport, importer: User, title: str | None, include_archived: bool, member_map: dict[str, int]) -> int:
    """Create the board and return its id. Everything happens in one transaction."""
    mapped_user_ids = {uid for tid, uid in member_map.items() if tid in export.members}
    users = {u.id: u for u in await User.filter(id__in=list(mapped_user_ids | {importer.id}))}
    missing = mapped_user_ids - set(users)
    if missing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown user id(s) in member_map: {sorted(missing)}")
    user_for_trello = {tid: users[uid] for tid, uid in member_map.items() if tid in export.members and uid in users}

    lists = [lst for lst in export.lists if include_archived or not lst.archived]
    active_list_ids = {lst.id for lst in lists}
    cards = [c for c in export.cards if c.list_id in active_list_ids and (include_archived or not c.archived)]
    used_label_ids = {lab for c in cards for lab in c.label_ids}

    async with in_transaction():
        board = await Board.create(
            title=(title or export.title).strip()[:200] or export.title, description=export.description, owner=importer
        )
        await board.members.add(*users.values())

        label_rows: dict[str, Label] = {}
        for trello_id, lab in export.labels.items():
            if trello_id in used_label_ids:
                label_rows[trello_id] = await Label.create(board=board, name=lab.name, color=lab.color)

        column_rows: dict[str, Column] = {}
        for position, lst in enumerate(lists):
            column_rows[lst.id] = await Column.create(board=board, title=lst.name[:120], position=position)

        positions: dict[str, int] = {}
        for card in cards:
            position = positions.get(card.list_id, 0)
            positions[card.list_id] = position + 1
            row = await Card.create(
                column=column_rows[card.list_id],
                title=card.name,
                description=card.description,
                position=position,
                due_date=card.due,
                created_by=importer,
            )
            labels = [label_rows[lab] for lab in card.label_ids if lab in label_rows]
            if labels:
                await row.labels.add(*labels)
            assignees = {user_for_trello[m].id: user_for_trello[m] for m in card.member_ids if m in user_for_trello}
            if assignees:
                await row.assignees.add(*assignees.values())
            for comment in card.comments:
                author = user_for_trello.get(comment.member_id or "")
                body = comment.text if author else f"{comment.member_name} (Trello): {comment.text}"
                created = await Comment.create(card=row, author=author or importer, body=body[:5000])
                if comment.created is not None:
                    await Comment.filter(id=created.id).update(created_at=comment.created)
    return board.id
