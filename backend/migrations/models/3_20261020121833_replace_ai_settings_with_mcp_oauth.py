from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "oauth_clients" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "client_id" VARCHAR(64) NOT NULL UNIQUE,
    "metadata" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL
);
COMMENT ON TABLE "oauth_clients" IS 'A dynamically registered OAuth client (e.g. claude.ai). `metadata` is the registration document.';
        CREATE TABLE IF NOT EXISTS "api_tokens" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "token_hash" VARCHAR(64) NOT NULL UNIQUE,
    "kind" VARCHAR(10) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "prefix" VARCHAR(12) NOT NULL,
    "client_id" VARCHAR(64),
    "scopes" JSONB NOT NULL,
    "resource" VARCHAR(2048),
    "expires_at" TIMESTAMPTZ,
    "revoked" BOOL NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL,
    "last_used_at" TIMESTAMPTZ,
    "user_id" INT NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE
);
COMMENT ON TABLE "api_tokens" IS 'Bearer tokens accepted by the MCP endpoint. Only a SHA-256 hash is stored.';
        CREATE TABLE IF NOT EXISTS "oauth_codes" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "code" VARCHAR(128) NOT NULL UNIQUE,
    "client_id" VARCHAR(64) NOT NULL,
    "scopes" JSONB NOT NULL,
    "code_challenge" VARCHAR(128) NOT NULL,
    "redirect_uri" VARCHAR(2048) NOT NULL,
    "redirect_uri_provided_explicitly" BOOL NOT NULL,
    "resource" VARCHAR(2048),
    "expires_at" DOUBLE PRECISION NOT NULL,
    "user_id" INT NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE
);
        DROP TABLE IF EXISTS "user_ai_settings";"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        DROP TABLE IF EXISTS "api_tokens";
        DROP TABLE IF EXISTS "oauth_clients";
        DROP TABLE IF EXISTS "oauth_codes";"""


MODELS_STATE = (
    "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"
    "oF8="
)
