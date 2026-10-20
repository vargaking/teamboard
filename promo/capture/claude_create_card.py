"""Act like Claude: create a card through TeamBoard's MCP server (the same path claude.ai / Claude Code use).

Usage (run with the backend venv's python, which has the `mcp` SDK):
  python claude_create_card.py http://localhost:47613 "Created by Claude" "To do"
Creates a personal access token for daniel@teamboard.local via REST, then calls the MCP tools list_boards/get_board/create_card.
"""
import asyncio
import json
import sys
import urllib.request

from mcp import ClientSession

try:  # mcp >= 2
    import httpx2
    from mcp.client.streamable_http import streamable_http_client

    def connect(url, token):
        client = httpx2.AsyncClient(headers={"Authorization": f"Bearer {token}"}, timeout=30)
        return streamable_http_client(url, http_client=client)
except ImportError:  # mcp 1.x
    from mcp.client.streamable_http import streamablehttp_client

    def connect(url, token):
        return streamablehttp_client(url, headers={"Authorization": f"Bearer {token}"})

BASE, TITLE, COLUMN = sys.argv[1].rstrip("/"), sys.argv[2], sys.argv[3]


def rest(method, path, token=None, body=None):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def payload(result):
    """Tool results arrive as one JSON text block per item."""
    items = [json.loads(c.text) for c in result.content if getattr(c, "type", "") == "text"]
    return items[0] if len(items) == 1 else items


async def main():
    jwt = rest("POST", "/api/auth/login", body={"email": "daniel@teamboard.local", "password": "changeme"})["access_token"]
    pat = rest("POST", "/api/tokens", jwt, {"name": "Claude (promo capture)"})["token"]
    async with connect(BASE + "/api/mcp", pat) as streams:
        async with ClientSession(streams[0], streams[1]) as s:
            await s.initialize()
            boards = payload(await s.call_tool("list_boards", {}))
            boards = boards if isinstance(boards, list) else [boards]
            board_id = next(b["id"] for b in boards if b["title"].startswith("Lucrum"))
            board = payload(await s.call_tool("get_board", {"board_id": board_id}))
            column_id = next(c["id"] for c in board["columns"] if c["title"] == COLUMN)
            labels = {l["name"]: l["id"] for l in board.get("labels", []) if isinstance(l, dict)}
            card = payload(
                await s.call_tool(
                    "create_card",
                    {
                        "column_id": column_id,
                        "title": TITLE,
                        "description": "Added from a Claude conversation through the TeamBoard MCP connector.",
                        "label_ids": [labels["docs"]] if "docs" in labels else [],
                    },
                )
            )
            print(json.dumps({"card_id": card.get("id"), "title": card.get("title")}))


asyncio.run(main())
