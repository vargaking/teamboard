from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "users" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "email" VARCHAR(255) NOT NULL UNIQUE,
    "name" VARCHAR(120) NOT NULL,
    "initials" VARCHAR(4) NOT NULL,
    "color" VARCHAR(7) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "is_admin" BOOL NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS "boards" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL,
    "owner_id" INT NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "columns" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "title" VARCHAR(120) NOT NULL,
    "position" INT NOT NULL,
    "board_id" INT NOT NULL REFERENCES "boards" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "cards" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT NOT NULL,
    "position" INT NOT NULL,
    "due_date" DATE,
    "created_at" TIMESTAMPTZ NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "column_id" INT NOT NULL REFERENCES "columns" ("id") ON DELETE CASCADE,
    "created_by_id" INT NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "comments" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL,
    "author_id" INT NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
    "card_id" INT NOT NULL REFERENCES "cards" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "labels" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "name" VARCHAR(60) NOT NULL,
    "color" VARCHAR(7) NOT NULL,
    "board_id" INT NOT NULL REFERENCES "boards" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "aerich" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "version" VARCHAR(255) NOT NULL,
    "app" VARCHAR(100) NOT NULL,
    "content" JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS "board_members" (
    "board_id" INT NOT NULL REFERENCES "boards" ("id") ON DELETE CASCADE,
    "user_id" INT NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_board_membe_board_i_9e873e" ON "board_members" ("board_id", "user_id");
CREATE TABLE IF NOT EXISTS "card_assignees" (
    "card_id" INT NOT NULL REFERENCES "cards" ("id") ON DELETE CASCADE,
    "user_id" INT NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_card_assign_card_id_d3be69" ON "card_assignees" ("card_id", "user_id");
CREATE TABLE IF NOT EXISTS "card_labels" (
    "card_id" INT NOT NULL REFERENCES "cards" ("id") ON DELETE CASCADE,
    "label_id" INT NOT NULL REFERENCES "labels" ("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_card_labels_card_id_1b50f6" ON "card_labels" ("card_id", "label_id");"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        """


MODELS_STATE = (
    "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"
    "B/Rl+d9DHkx6/R83kgFt"
)
