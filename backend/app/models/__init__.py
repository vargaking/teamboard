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
    api_tokens: fields.ReverseRelation["ApiToken"]
    oauth_codes: fields.ReverseRelation["OAuthAuthorizationCode"]

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


# ---------- MCP / OAuth ----------
class OAuthClient(Model):
    """A dynamically registered OAuth client (e.g. claude.ai). `metadata` is the registration document."""

    id = fields.IntField(primary_key=True)
    client_id = fields.CharField(max_length=64, unique=True)
    metadata = fields.JSONField()
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "oauth_clients"


class OAuthAuthorizationCode(Model):
    id = fields.IntField(primary_key=True)
    code = fields.CharField(max_length=128, unique=True)
    client_id = fields.CharField(max_length=64)
    user: fields.ForeignKeyRelation[User] = fields.ForeignKeyField("models.User", related_name="oauth_codes", on_delete=fields.CASCADE)
    scopes = fields.JSONField()
    code_challenge = fields.CharField(max_length=128)
    redirect_uri = fields.CharField(max_length=2048)
    redirect_uri_provided_explicitly = fields.BooleanField()
    resource = fields.CharField(max_length=2048, null=True)
    expires_at = fields.FloatField()

    class Meta:
        table = "oauth_codes"


class ApiToken(Model):
    """Bearer tokens accepted by the MCP endpoint. Only a SHA-256 hash is stored.

    kind: "access" / "refresh" (issued by the OAuth flow, tied to an OAuth client) or
          "personal" (created by the user in the UI for Claude Code / scripts; no expiry).
    """

    id = fields.IntField(primary_key=True)
    token_hash = fields.CharField(max_length=64, unique=True)
    kind = fields.CharField(max_length=10)
    name = fields.CharField(max_length=120, default="")
    prefix = fields.CharField(max_length=12, default="")  # first characters, for display only
    client_id = fields.CharField(max_length=64, null=True)
    user: fields.ForeignKeyRelation[User] = fields.ForeignKeyField("models.User", related_name="api_tokens", on_delete=fields.CASCADE)
    scopes = fields.JSONField()
    resource = fields.CharField(max_length=2048, null=True)
    expires_at = fields.DatetimeField(null=True)
    revoked = fields.BooleanField(default=False)
    created_at = fields.DatetimeField(auto_now_add=True)
    last_used_at = fields.DatetimeField(null=True)

    class Meta:
        table = "api_tokens"


class Invite(Model):
    """An invite link. Only the SHA-256 hash of the token is stored; the URL is shown once at creation."""

    id = fields.IntField(primary_key=True)
    token_hash = fields.CharField(max_length=64, unique=True)
    email = fields.CharField(max_length=255, null=True)
    name = fields.CharField(max_length=120, null=True)
    board: fields.ForeignKeyNullableRelation[Board] = fields.ForeignKeyField(
        "models.Board", related_name="invites", on_delete=fields.SET_NULL, null=True
    )
    created_by: fields.ForeignKeyRelation[User] = fields.ForeignKeyField(
        "models.User", related_name="created_invites", on_delete=fields.CASCADE
    )
    created_at = fields.DatetimeField(auto_now_add=True)
    expires_at = fields.DatetimeField()
    max_uses = fields.IntField(default=1)
    uses = fields.IntField(default=0)
    revoked = fields.BooleanField(default=False)

    class Meta:
        table = "invites"
