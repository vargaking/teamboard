"""Idempotent seed: the 12 team members plus one demo board. Run with `python -m app.seed`."""

import asyncio
import logging
from datetime import date, timedelta

from tortoise import Tortoise

from app.core.config import get_settings
from app.core.security import hash_password
from app.db import TORTOISE_ORM
from app.models import Board, Card, Column, Label, User

log = logging.getLogger(__name__)

# (email local part, display name, avatar colour, admin)
TEAM: list[tuple[str, str, str, bool]] = [
    ("daniel", "Dániel Gergely", "#1677ff", True),
    ("miki", "Miki Petkovic", "#fa541c", False),
    ("izzet", "Izzet Pensoy", "#13c2c2", False),
    ("ramtin", "Ramtin Kolahchi", "#722ed1", False),
    ("andrei", "Andrei Olariu", "#52c41a", False),
    ("andrada", "Andrada Florea", "#eb2f96", False),
    ("gergo", "Gergo Bihari", "#faad14", False),
    ("peera", "Peera Wiwattanakantang", "#2f54eb", False),
    ("botond", "Botond Mecsei", "#a0d911", False),
    ("vladimir", "Vladimir Baranov", "#f5222d", False),
    ("lorik", "Lorik Heijnen (PM)", "#08979c", False),
    ("konstantin", "Konstantin Stoyanov (PM)", "#531dab", False),
]

DEMO_LABELS = [("frontend", "#1677ff"), ("backend", "#52c41a"), ("docs", "#faad14"), ("bug", "#f5222d")]


def initials_for(name: str) -> str:
    parts = [p for p in name.replace("(", " ").replace(")", " ").split() if p and p.upper() != "PM"]
    return "".join(p[0] for p in parts[:2]).upper() or "?"


async def seed() -> None:
    password_hash = hash_password(get_settings().seed_password)
    users: dict[str, User] = {}
    for local, name, color, is_admin in TEAM:
        email = f"{local}@teamboard.local"
        user, created = await User.get_or_create(
            email=email,
            defaults={"name": name, "initials": initials_for(name), "color": color, "password_hash": password_hash, "is_admin": is_admin},
        )
        users[local] = user
        if created:
            log.info("created user %s", email)

    if await Board.exists():
        return  # demo board only on an empty instance

    owner = users["daniel"]
    board = await Board.create(title="Lucrum Backtesting Platform", description="Sprint board for the SEP project.", owner=owner)
    await board.members.add(*users.values())
    labels = {name: await Label.create(board=board, name=name, color=color) for name, color in DEMO_LABELS}
    cols = [await Column.create(board=board, title=t, position=i) for i, t in enumerate(["To do", "In progress", "Review", "Done"])]
    today = date.today()
    demo = [
        (0, "Set up repo, CI and Docker compose", ["backend"], ["daniel"], 3),
        (0, "Write strategy integration contract draft", ["docs"], ["miki", "izzet"], 7),
        (0, "Design data catalogue schema", ["backend"], ["andrei"], 10),
        (1, "Login page + auth context", ["frontend"], ["daniel"], 2),
        (1, "Backtest configuration form", ["frontend"], ["andrada", "gergo"], 5),
        (2, "Aerich migration for strategy registry", ["backend"], ["ramtin"], 1),
        (3, "URD v0.4 signed by clients", ["docs"], ["lorik", "konstantin"], -5),
    ]
    for col_index, title, label_names, assignees, days in demo:
        column = cols[col_index]
        card = await Card.create(
            column=column,
            title=title,
            description="",
            position=await Card.filter(column=column).count(),
            due_date=today + timedelta(days=days),
            created_by=owner,
        )
        await card.labels.add(*(labels[n] for n in label_names))
        await card.assignees.add(*(users[a] for a in assignees))
    log.info("created demo board %s", board.id)


async def _main() -> None:
    logging.basicConfig(level=logging.INFO)
    await Tortoise.init(config=TORTOISE_ORM)
    try:
        await seed()
    finally:
        await Tortoise.close_connections()


if __name__ == "__main__":
    asyncio.run(_main())
