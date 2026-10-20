"""Tortoise ORM models. Aerich points at this module (see app/db.py)."""

from tortoise import fields
from tortoise.models import Model


class User(Model):
    id = fields.IntField(primary_key=True)
    email = fields.CharField(max_length=255, unique=True)
    name = fields.CharField(max_length=120)
    initials = fields.CharField(max_length=4)
    color = fields.CharField(max_length=7)  # hex, e.g. #1677ff
    password_hash = fields.CharField(max_length=255)
    is_admin = fields.BooleanField(default=False)
    created_at = fields.DatetimeField(auto_now_add=True)

    boards: fields.ManyToManyRelation["Board"]
    assigned_cards: fields.ManyToManyRelation["Card"]
    reviewing_cards: fields.ManyToManyRelation["Card"]
    ai_settings: fields.ReverseRelation["UserAISettings"]

    class Meta:
        table = "users"

    def __str__(self) -> str:
        return self.email


class Board(Model):
    id = fields.IntField(primary_key=True)
    title = fields.CharField(max_length=200)
    description = fields.TextField(default="")
    owner: fields.ForeignKeyRelation[User] = fields.ForeignKeyField("models.User", related_name="owned_boards", on_delete=fields.CASCADE)
    members: fields.ManyToManyRelation[User] = fields.ManyToManyField(
        "models.User", related_name="boards", through="board_members", forward_key="user_id", backward_key="board_id"
    )
    created_at = fields.DatetimeField(auto_now_add=True)

    columns: fields.ReverseRelation["Column"]
    labels: fields.ReverseRelation["Label"]

    class Meta:
        table = "boards"


class Label(Model):
    id = fields.IntField(primary_key=True)
    board: fields.ForeignKeyRelation[Board] = fields.ForeignKeyField("models.Board", related_name="labels", on_delete=fields.CASCADE)
    name = fields.CharField(max_length=60)
    color = fields.CharField(max_length=7)

    cards: fields.ManyToManyRelation["Card"]

    class Meta:
        table = "labels"


class Column(Model):
    id = fields.IntField(primary_key=True)
    board: fields.ForeignKeyRelation[Board] = fields.ForeignKeyField("models.Board", related_name="columns", on_delete=fields.CASCADE)
    title = fields.CharField(max_length=120)
    position = fields.IntField()

    cards: fields.ReverseRelation["Card"]

    class Meta:
        table = "columns"
        ordering = ["position", "id"]


class Card(Model):
    id = fields.IntField(primary_key=True)
    column: fields.ForeignKeyRelation[Column] = fields.ForeignKeyField("models.Column", related_name="cards", on_delete=fields.CASCADE)
    title = fields.CharField(max_length=300)
    description = fields.TextField(default="")
    position = fields.IntField()
    due_date = fields.DateField(null=True)
    created_by: fields.ForeignKeyRelation[User] = fields.ForeignKeyField(
        "models.User", related_name="created_cards", on_delete=fields.CASCADE
    )
    assignees: fields.ManyToManyRelation[User] = fields.ManyToManyField(
        "models.User", related_name="assigned_cards", through="card_assignees", forward_key="user_id", backward_key="card_id"
    )
    reviewers: fields.ManyToManyRelation[User] = fields.ManyToManyField(
        "models.User", related_name="reviewing_cards", through="card_reviewers", forward_key="user_id", backward_key="card_id"
    )
    labels: fields.ManyToManyRelation[Label] = fields.ManyToManyField(
        "models.Label", related_name="cards", through="card_labels", forward_key="label_id", backward_key="card_id"
    )
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    comments: fields.ReverseRelation["Comment"]

    class Meta:
        table = "cards"
        ordering = ["position", "id"]


class Comment(Model):
    id = fields.IntField(primary_key=True)
    card: fields.ForeignKeyRelation[Card] = fields.ForeignKeyField("models.Card", related_name="comments", on_delete=fields.CASCADE)
    author: fields.ForeignKeyRelation[User] = fields.ForeignKeyField("models.User", related_name="comments", on_delete=fields.CASCADE)
    body = fields.TextField()
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "comments"
        ordering = ["created_at", "id"]


class UserAISettings(Model):
    """Per-user bring-your-own-key AI configuration. `api_key_encrypted` is a Fernet token (see app/ai/crypto.py)."""

    id = fields.IntField(primary_key=True)
    user: fields.OneToOneRelation[User] = fields.OneToOneField("models.User", related_name="ai_settings", on_delete=fields.CASCADE)
    provider = fields.CharField(max_length=20)  # "anthropic" | "openai"
    model = fields.CharField(max_length=120, null=True)
    api_key_encrypted = fields.TextField()
    key_hint = fields.CharField(max_length=8)  # last 4 characters, for display only
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "user_ai_settings"
