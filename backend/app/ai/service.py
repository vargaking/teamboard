"""AI features: credentials lookup, board-to-text context, prompts and result validation.

Every function here returns a *proposal*; nothing writes to the board.
"""

from datetime import date
from typing import Any

from fastapi import HTTPException, status
from pydantic import BaseModel, Field, ValidationError

from app.ai import providers
from app.ai.crypto import decrypt
from app.ai.providers import Credentials
from app.models import User, UserAISettings
from app.schemas import BoardDetail, CardOut

NOT_CONFIGURED = "AI is not configured. Add an API key in AI settings."
MAX_CHAT_MESSAGES = 30
MAX_CHAT_CHARS = 8000


async def credentials_for(user: User) -> Credentials:
    settings = await UserAISettings.get_or_none(user_id=user.id)
    if settings is None or not settings.model:
        raise HTTPException(status.HTTP_409_CONFLICT, NOT_CONFIGURED)
    api_key = decrypt(settings.api_key_encrypted)
    if api_key is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Your stored API key can no longer be read. Please enter it again in AI settings.")
    return Credentials(provider=settings.provider, api_key=api_key, model=settings.model)  # type: ignore[arg-type]


def provider_error(exc: providers.AIProviderError) -> HTTPException:
    return HTTPException(status.HTTP_502_BAD_GATEWAY, exc.message)


# ---------- context ----------
def _names(users: list[Any]) -> str:
    return ", ".join(u.name for u in users) or "nobody"


def card_to_text(card: CardOut, column_title: str, today: date) -> str:
    due = "none"
    if card.due_date is not None:
        delta = (card.due_date - today).days
        state = "OVERDUE" if delta < 0 else ("due today" if delta == 0 else f"in {delta} days")
        due = f"{card.due_date.isoformat()} ({state})"
    labels = ", ".join(label.name for label in card.labels) or "none"
    lines = [
        f"- [#{card.id}] {card.title}",
        f"  column: {column_title} | due: {due} | labels: {labels}",
        f"  assignees: {_names(card.assignees)} | reviewers: {_names(card.reviewers)} | comments: {card.comment_count}",
    ]
    if card.description.strip():
        desc = card.description.strip().replace("\n", "\n    ")
        lines.append(f"  description:\n    {desc[:1500]}")
    return "\n".join(lines)


def board_to_text(board: BoardDetail, today: date) -> str:
    parts = [
        f"Board: {board.title}",
        f"Description: {board.description or '(none)'}",
        f"Today: {today.isoformat()}",
        f"Members: {', '.join(f'{m.name} (id {m.id})' for m in board.members)}",
        f"Labels: {', '.join(f'{label.name} (id {label.id})' for label in board.labels) or 'none'}",
        "",
    ]
    for column in board.columns:
        parts.append(f"## Column: {column.title} (id {column.id}, {len(column.cards)} cards)")
        parts.extend(card_to_text(card, column.title, today) for card in column.cards)
        if not column.cards:
            parts.append("(empty)")
        parts.append("")
    return "\n".join(parts)


BASE_SYSTEM = (
    "You are an assistant embedded in TeamBoard, a kanban board used by a 12-person student software engineering team "
    "building a trading/backtesting platform. Be concrete and brief. Never invent people, labels or columns that are not "
    "in the context; refer to people by name. Use plain markdown without front matter."
)


# ---------- card assist ----------
class DescribeOut(BaseModel):
    description: str = Field(min_length=1)


class CriteriaOut(BaseModel):
    criteria: list[str] = Field(min_length=1, max_length=15)


class SubtaskOut(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    description: str = ""


class SubtasksOut(BaseModel):
    subtasks: list[SubtaskOut] = Field(min_length=1, max_length=12)


class NewLabel(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")


class LabelsOut(BaseModel):
    label_ids: list[int] = Field(default_factory=list)
    new_labels: list[NewLabel] = Field(default_factory=list, max_length=5)


ASSIST_SPECS: dict[str, tuple[type[BaseModel], str]] = {
    "describe": (
        DescribeOut,
        "Write a clear description for this card as markdown: one-paragraph goal, then 'Scope' and 'Out of scope' bullet lists, "
        "then 'Notes' if useful. 120-220 words. Keep anything the current description already states.",
    ),
    "acceptance_criteria": (
        CriteriaOut,
        "Propose 3-8 testable acceptance criteria for this card. Each criterion is one sentence in the form "
        "'<Given/When/Then or observable condition>' without numbering or checkboxes.",
    ),
    "subtasks": (
        SubtasksOut,
        "Break this card into 2-8 independent subtasks that different people could pick up. Each has a short imperative title "
        "(max 10 words) and a one-to-three sentence description. Do not repeat the parent card as a subtask.",
    ),
    "labels": (
        LabelsOut,
        "Choose which EXISTING board labels apply to this card (return their ids in label_ids) and propose at most 2 NEW labels "
        "(name + hex colour) only if no existing label fits an important aspect. Prefer existing labels.",
    ),
}


def _validate(model: type[BaseModel], raw: dict[str, Any]) -> BaseModel:
    try:
        return model.model_validate(raw)
    except ValidationError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"The model returned an unexpected shape: {exc.errors()[0]['msg']}") from exc


async def card_assist(
    creds: Credentials, board: BoardDetail, card: CardOut, column_title: str, action: str, instructions: str | None
) -> dict[str, Any]:
    model_cls, task = ASSIST_SPECS[action]
    today = date.today()
    user_prompt = (
        f"{task}\n\n"
        + (f"Extra instructions from the user: {instructions.strip()}\n\n" if instructions and instructions.strip() else "")
        + f"Card:\n{card_to_text(card, column_title, today)}\n\n"
        + f"Board context (for consistency, do not describe it):\nBoard: {board.title} - {board.description or '(no description)'}\n"
        + f"Columns: {', '.join(c.title for c in board.columns)}\n"
        + f"Labels: {', '.join(f'{label.name} (id {label.id})' for label in board.labels) or 'none'}\n"
        + f"Members: {', '.join(m.name for m in board.members)}"
    )
    raw = await providers.complete_json(creds, BASE_SYSTEM, user_prompt, model_cls.model_json_schema(), f"card_{action}")
    result = _validate(model_cls, raw)
    if isinstance(result, LabelsOut):
        valid_ids = {label.id for label in board.labels}
        existing_names = {label.name.lower() for label in board.labels}
        result.label_ids = [i for i in dict.fromkeys(result.label_ids) if i in valid_ids]
        result.new_labels = [nl for nl in result.new_labels if nl.name.lower() not in existing_names]
    return {"action": action, **result.model_dump()}


# ---------- summary ----------
async def board_summary(creds: Credentials, board: BoardDetail) -> str:
    today = date.today()
    prompt = (
        "Write a stand-up style summary of this board for the team lead. Sections (## headings): "
        "'Progress' (what moved / what is done, counts per column), 'At risk' (overdue or due within 3 days, cards without assignees, "
        "cards in review without reviewers), 'Workload' (one line per member: open card count and titles; mention members with nothing), "
        "'Suggested focus' (3 bullets max). Reference cards as `#id Title`. Max 350 words.\n\n" + board_to_text(board, today)
    )
    return await providers.complete_text(creds, BASE_SYSTEM, [{"role": "user", "content": prompt}])


# ---------- draft cards ----------
class DraftCardOut(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    description: str = ""
    column_id: int
    label_ids: list[int] = Field(default_factory=list)
    assignee_ids: list[int] = Field(default_factory=list)
    due_date: date | None = None


class DraftCardsOut(BaseModel):
    cards: list[DraftCardOut] = Field(max_length=25)


async def draft_cards(creds: Credentials, board: BoardDetail, text: str, default_column_id: int) -> list[dict[str, Any]]:
    today = date.today()
    prompt = (
        "Turn the following notes into kanban cards. One card per distinct piece of work; skip chit-chat and decisions that need "
        "no action. Titles are short and imperative. Descriptions carry the relevant details from the notes (quote specifics). "
        f"Use column_id {default_column_id} unless the notes clearly say the work is already in progress / in review / done, "
        "in which case pick the matching existing column id. Only use label ids, member ids and column ids that exist on the board. "
        "Set due_date (YYYY-MM-DD) only when the notes give a date or a clear deadline relative to today; otherwise null. "
        "Set assignee_ids only when the notes name who does it.\n\n"
        f'Notes:\n"""\n{text.strip()[:12000]}\n"""\n\n'
        f"{board_to_text(board, today)}"
    )
    raw = await providers.complete_json(creds, BASE_SYSTEM, prompt, DraftCardsOut.model_json_schema(), "draft_cards")
    result = _validate(DraftCardsOut, raw)
    assert isinstance(result, DraftCardsOut)
    column_ids = {c.id for c in board.columns}
    label_ids = {label.id for label in board.labels}
    member_ids = {m.id for m in board.members}
    cleaned: list[dict[str, Any]] = []
    for card in result.cards:
        cleaned.append(
            {
                "title": card.title.strip(),
                "description": card.description.strip(),
                "column_id": card.column_id if card.column_id in column_ids else default_column_id,
                "label_ids": [i for i in dict.fromkeys(card.label_ids) if i in label_ids],
                "assignee_ids": [i for i in dict.fromkeys(card.assignee_ids) if i in member_ids],
                "due_date": card.due_date.isoformat() if card.due_date else None,
            }
        )
    return cleaned


# ---------- chat ----------
async def chat(creds: Credentials, board: BoardDetail, messages: list[dict[str, str]], asking_user: User) -> str:
    today = date.today()
    system = (
        BASE_SYSTEM + f"\n\nYou are talking to {asking_user.name}. Answer questions about the board below using only its content; "
        "if the board does not contain the answer, say so. When listing cards use `#id Title`. Keep answers short.\n\n"
        + board_to_text(board, today)
    )
    return await providers.complete_text(creds, system, messages)
