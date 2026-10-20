from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.security import decode_access_token
from app.models import Board, User
from app.realtime import GLOBAL_CHANNEL, hub
from app.services import can_access_board

router = APIRouter(prefix="/ws", tags=["realtime"])

CLOSE_UNAUTHORIZED = 4401
CLOSE_FORBIDDEN = 4403
CLOSE_NOT_FOUND = 4404


async def _authenticate(ws: WebSocket) -> User | None:
    token = ws.query_params.get("token", "")
    user_id = decode_access_token(token) if token else None
    if user_id is None:
        return None
    return await User.get_or_none(id=user_id)


async def _pump(ws: WebSocket, channel: int) -> None:
    """Keep the socket open; answer pings; drop the subscription when the client goes away."""
    await hub.subscribe(channel, ws)
    try:
        while True:
            text = await ws.receive_text()
            if text == "ping":
                await ws.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        await hub.unsubscribe(channel, ws)


@router.websocket("/boards")
async def boards_channel(ws: WebSocket) -> None:
    await ws.accept()
    user = await _authenticate(ws)
    if user is None:
        await ws.close(code=CLOSE_UNAUTHORIZED)
        return
    await _pump(ws, GLOBAL_CHANNEL)


@router.websocket("/boards/{board_id}")
async def board_channel(ws: WebSocket, board_id: int) -> None:
    await ws.accept()
    user = await _authenticate(ws)
    if user is None:
        await ws.close(code=CLOSE_UNAUTHORIZED)
        return
    if not await Board.exists(id=board_id):
        await ws.close(code=CLOSE_NOT_FOUND)
        return
    if not await can_access_board(user, board_id):
        await ws.close(code=CLOSE_FORBIDDEN)
        return
    await _pump(ws, board_id)
