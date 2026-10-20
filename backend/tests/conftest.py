import os

# Must be set before `app` is imported: settings are read at import time.
# Default: in-memory SQLite (no services needed). Set TEST_DATABASE_URL to run against PostgreSQL,
# e.g. TEST_DATABASE_URL=postgres://teamboard:teamboard@localhost:5432/teamboard_test
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", "sqlite://:memory:")
os.environ["AUTO_GENERATE_SCHEMAS"] = "true"
os.environ["SEED_ON_STARTUP"] = "true"
os.environ["SECRET_KEY"] = "test-secret-key-that-is-long-enough"

import pytest
from fastapi.testclient import TestClient
from tortoise import Tortoise

from app.db import TORTOISE_ORM
from app.main import app

TABLES = (
    "card_labels, card_assignees, card_reviewers, comments, cards, columns, labels, board_members, boards, "
    "api_tokens, oauth_codes, oauth_clients, users, aerich"
)


async def _drop_everything() -> None:
    """Postgres test DBs persist between tests; wipe them so each test starts from the seed only."""
    await Tortoise.init(config=TORTOISE_ORM)
    try:
        await Tortoise.get_connection("default").execute_script(f"DROP TABLE IF EXISTS {TABLES} CASCADE;")
    finally:
        await Tortoise.close_connections()


def reset_database() -> None:
    if os.environ["DATABASE_URL"].startswith("postgres"):
        import asyncio

        asyncio.run(_drop_everything())


@pytest.fixture
def client():
    reset_database()
    # Context manager runs the lifespan: DB init, schema generation, seeding.
    with TestClient(app) as c:
        yield c


def login(client: TestClient, local_part: str) -> dict[str, str]:
    r = client.post("/api/auth/login", json={"email": f"{local_part}@teamboard.local", "password": "changeme"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}
