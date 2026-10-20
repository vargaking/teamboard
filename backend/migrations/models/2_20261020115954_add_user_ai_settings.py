from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "user_ai_settings" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "provider" VARCHAR(20) NOT NULL,
    "model" VARCHAR(120),
    "api_key_encrypted" TEXT NOT NULL,
    "key_hint" VARCHAR(8) NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "user_id" INT NOT NULL UNIQUE REFERENCES "users" ("id") ON DELETE CASCADE
);
COMMENT ON TABLE "user_ai_settings" IS 'Per-user bring-your-own-key AI configuration. `api_key_encrypted` is a Fernet token (see app/ai/crypto.py).';"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        DROP TABLE IF EXISTS "user_ai_settings";"""


MODELS_STATE = (
    "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"
    "ZzD5ZCUXmLELdFeNDFZdzF7+B9UmGqI="
)
