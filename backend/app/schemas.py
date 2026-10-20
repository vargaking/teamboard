from datetime import date, datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

HexColor = Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")]
# Internal accounts may use non-public TLDs such as @teamboard.local, which strict validators reject.
Email = Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, max_length=255, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
NonEmptyStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- users / auth ----------
class UserOut(ORMModel):
    id: int
    email: str
    name: str
    initials: str
    color: str
    is_admin: bool
    created_at: datetime


class LoginIn(BaseModel):
    email: Email
    password: str = Field(min_length=1)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ChangePasswordIn(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=128)


# ---------- labels ----------
class LabelOut(ORMModel):
    id: int
    board_id: int
    name: str
    color: str


class LabelCreate(BaseModel):
    name: Annotated[NonEmptyStr, StringConstraints(max_length=60)]
    color: HexColor


class LabelUpdate(BaseModel):
    name: Annotated[NonEmptyStr, StringConstraints(max_length=60)] | None = None
    color: HexColor | None = None


# ---------- comments ----------
class CommentOut(ORMModel):
    id: int
    card_id: int
    author: UserOut
    body: str
    created_at: datetime


class CommentCreate(BaseModel):
    body: Annotated[NonEmptyStr, StringConstraints(max_length=5000)]


# ---------- cards ----------
class CardOut(ORMModel):
    id: int
    column_id: int
    title: str
    description: str
    position: int
    due_date: date | None
    assignees: list[UserOut]
    reviewers: list[UserOut]
    labels: list[LabelOut]
    comment_count: int
    created_by: int
    created_at: datetime
    updated_at: datetime


class CardCreate(BaseModel):
    title: Annotated[NonEmptyStr, StringConstraints(max_length=300)]
    description: str = ""
    due_date: date | None = None
    assignee_ids: list[int] = Field(default_factory=list)
    reviewer_ids: list[int] = Field(default_factory=list)
    label_ids: list[int] = Field(default_factory=list)


class CardUpdate(BaseModel):
    """All fields optional. `due_date` distinguishes 'absent' from explicit null via model_fields_set."""

    title: Annotated[NonEmptyStr, StringConstraints(max_length=300)] | None = None
    description: str | None = None
    due_date: date | None = None
    assignee_ids: list[int] | None = None
    reviewer_ids: list[int] | None = None
    label_ids: list[int] | None = None


class CardMove(BaseModel):
    column_id: int
    position: int = Field(ge=0)


# ---------- columns ----------
class ColumnOut(ORMModel):
    id: int
    board_id: int
    title: str
    position: int
    cards: list[CardOut]


class ColumnCreate(BaseModel):
    title: Annotated[NonEmptyStr, StringConstraints(max_length=120)]


class ColumnUpdate(BaseModel):
    title: Annotated[NonEmptyStr, StringConstraints(max_length=120)]


class ColumnOrder(BaseModel):
    column_ids: list[int]


# ---------- boards ----------
class BoardSummary(ORMModel):
    id: int
    title: str
    description: str
    owner_id: int
    member_ids: list[int]
    created_at: datetime


class BoardDetail(ORMModel):
    id: int
    title: str
    description: str
    owner_id: int
    members: list[UserOut]
    labels: list[LabelOut]
    columns: list[ColumnOut]
    created_at: datetime


class BoardCreate(BaseModel):
    title: Annotated[NonEmptyStr, StringConstraints(max_length=200)]
    description: str = ""


class BoardUpdate(BaseModel):
    title: Annotated[NonEmptyStr, StringConstraints(max_length=200)] | None = None
    description: str | None = None


class BoardMembersIn(BaseModel):
    user_ids: list[int]
