from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE "card_reviewers" (
    "card_id" INT NOT NULL REFERENCES "cards" ("id") ON DELETE CASCADE,
    "user_id" INT NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE
);"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        DROP TABLE IF EXISTS "card_reviewers";"""


MODELS_STATE = (
    "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"
    "b6P1LQRPk="
)
