"""In-process WebSocket hub used to push "something changed" hints to connected clients.

Clients never receive board state over the socket; they refetch via the REST API when told to.
This hub lives in one process. If you ever run several uvicorn workers, replace `BoardHub` with a
Redis pub/sub backed implementation (same public methods) so events reach every worker.
"""

import asyncio
import logging
from collections import defaultdict
from typing import Any

from fastapi import WebSocket

log = logging.getLogger(__name__)

GLOBAL_CHANNEL = 0  # board_id used for the board-list channel


class BoardHub:
    def __init__(self) -> None:
        self._subscribers: dict[int, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def subscribe(self, board_id: int, ws: WebSocket) -> None:
        async with self._lock:
            self._subscribers[board_id].add(ws)

    async def unsubscribe(self, board_id: int, ws: WebSocket) -> None:
        async with self._lock:
            self._subscribers[board_id].discard(ws)
            if not self._subscribers[board_id]:
                del self._subscribers[board_id]

    async def _publish(self, channel: int, payload: dict[str, Any]) -> None:
        async with self._lock:
            targets = list(self._subscribers.get(channel, ()))
        if not targets:
            return
        results = await asyncio.gather(*(ws.send_json(payload) for ws in targets), return_exceptions=True)
        dead = [ws for ws, result in zip(targets, results, strict=True) if isinstance(result, Exception)]
        for ws in dead:
            await self.unsubscribe(channel, ws)

    async def board_updated(self, board_id: int, event: str, actor_id: int, entity_id: int | None = None) -> None:
        await self._publish(
            board_id,
            {"type": "board.updated", "board_id": board_id, "event": event, "actor_id": actor_id, "entity_id": entity_id},
        )

    async def boards_changed(self, board_id: int, event: str, actor_id: int) -> None:
        await self._publish(GLOBAL_CHANNEL, {"type": "boards.changed", "board_id": board_id, "event": event, "actor_id": actor_id})

    async def board_deleted(self, board_id: int) -> None:
        payload = {"type": "board.deleted", "board_id": board_id}
        await self._publish(board_id, payload)
        await self._publish(GLOBAL_CHANNEL, payload)

    def connection_count(self) -> int:
        return sum(len(s) for s in self._subscribers.values())


hub = BoardHub()
