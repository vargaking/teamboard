from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "invites" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "token_hash" VARCHAR(64) NOT NULL UNIQUE,
    "email" VARCHAR(255),
    "name" VARCHAR(120),
    "created_at" TIMESTAMPTZ NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "max_uses" INT NOT NULL,
    "uses" INT NOT NULL,
    "revoked" BOOL NOT NULL,
    "board_id" INT REFERENCES "boards" ("id") ON DELETE SET NULL,
    "created_by_id" INT NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE
);
COMMENT ON TABLE "invites" IS 'An invite link. Only the SHA-256 hash of the token is stored; the URL is shown once at creation.';"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        DROP TABLE IF EXISTS "invites";"""


MODELS_STATE = (
    "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"
)
