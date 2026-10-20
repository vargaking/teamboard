import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from tortoise.contrib.fastapi import RegisterTortoise

from app.core.config import get_settings
from app.db import TORTOISE_ORM
from app.realtime import hub
from app.routers import ai, auth, boards, cards, columns, users, ws

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
settings = get_settings()


@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncIterator[None]:
    # RegisterTortoise enables Tortoise's global context fallback, which is required because
    # request tasks do not inherit the lifespan task's context variables.
    async with RegisterTortoise(application, config=TORTOISE_ORM, generate_schemas=settings.auto_generate_schemas):
        if settings.seed_on_startup:
            from app.seed import seed

            await seed()
        yield


app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api"
app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(users.router, prefix=API_PREFIX)
app.include_router(boards.router, prefix=API_PREFIX)
app.include_router(columns.router, prefix=API_PREFIX)
app.include_router(cards.router, prefix=API_PREFIX)
app.include_router(ws.router, prefix=API_PREFIX)
app.include_router(ai.router, prefix=API_PREFIX)


@app.get(f"{API_PREFIX}/health", tags=["meta"])
async def health() -> dict[str, object]:
    return {"status": "ok", "websocket_connections": hub.connection_count()}
