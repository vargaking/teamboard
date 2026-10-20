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
from mcp.client.streamable_http import streamablehttp_client

BASE, TITLE, COLUMN = sys.argv[1].rstrip("/"), sys.argv[2], sys.argv[3]


def rest(method, path, token=None, body=None):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def payload(result):
    if getattr(result, "structuredContent", None):
        sc = result.structuredContent
        return sc.get("result", sc) if isinstance(sc, dict) else sc
    return json.loads(result.content[0].text)


async def main():
    jwt = rest("POST", "/api/auth/login", body={"email": "daniel@teamboard.local", "password": "changeme"})["access_token"]
    pat = rest("POST", "/api/tokens", jwt, {"name": "Claude (promo capture)"})["token"]
    async with streamablehttp_client(BASE + "/api/mcp", headers={"Authorization": f"Bearer {pat}"}) as (r, w, _):
        async with ClientSession(r, w) as s:
            await s.initialize()
            boards = payload(await s.call_tool("list_boards", {}))
            board_id = next(b["id"] for b in boards if b["title"].startswith("Lucrum"))
            board = payload(await s.call_tool("get_board", {"board_id": board_id}))
            column_id = next(c["id"] for c in board["columns"] if c["title"] == COLUMN)
            labels = {l["name"]: l["id"] for l in board["labels"]}
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
