"""End-to-end: OAuth discovery → dynamic client registration → authorize → consent → PKCE token exchange →
refresh rotation, then the MCP tools through the official MCP client, all against the in-process ASGI app."""

import asyncio
import base64
import hashlib
import secrets
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx2
from mcp.client.client import Client
from mcp.client.streamable_http import streamable_http_client

from app.main import app
from tests.conftest import reset_database  # noqa: I001  (sets env before app import)

BASE = "http://localhost:8080"
CALLBACK = "https://claude.ai/api/mcp/auth_callback"


def _asgi_client(headers: dict[str, str] | None = None) -> httpx2.AsyncClient:
    return httpx2.AsyncClient(transport=httpx2.ASGITransport(app=app), base_url=BASE, headers=headers or {})


async def _login(http: httpx2.AsyncClient, local: str) -> tuple[dict[str, str], int]:
    r = await http.post("/api/auth/login", json={"email": f"{local}@teamboard.local", "password": "changeme"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}, r.json()["user"]["id"]


async def _oauth_flow(http: httpx2.AsyncClient, user_headers: dict[str, str]) -> dict[str, Any]:
    # --- discovery (what claude.ai does after the first 401) ---
    r = await http.post("/api/mcp", json={})
    assert r.status_code == 401
    assert 'resource_metadata="http://localhost:8080/.well-known/oauth-protected-resource/api/mcp"' in r.headers["www-authenticate"]
    prm = (await http.get("/.well-known/oauth-protected-resource/api/mcp")).json()
    assert prm["resource"] == f"{BASE}/api/mcp" and prm["authorization_servers"] == [f"{BASE}/api/oauth"]
    meta = (await http.get("/.well-known/oauth-authorization-server/api/oauth")).json()
    assert (await http.get("/api/oauth/.well-known/oauth-authorization-server")).json() == meta
    assert meta["issuer"] == f"{BASE}/api/oauth" and meta["code_challenge_methods_supported"] == ["S256"]
    assert meta["authorization_endpoint"] == f"{BASE}/api/oauth/authorize" and meta["token_endpoint"] == f"{BASE}/api/oauth/token"
    assert meta["registration_endpoint"] == f"{BASE}/api/oauth/register"

    # --- dynamic client registration ---
    r = await http.post(
        "/api/oauth/register",
        json={
            "client_name": "Claude",
            "redirect_uris": [CALLBACK],
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            "token_endpoint_auth_method": "none",
            "scope": "board",
        },
    )
    assert r.status_code == 201, r.text
    client_id = r.json()["client_id"]

    # --- authorize with PKCE -> redirect to the SPA consent page ---
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    state = secrets.token_urlsafe(8)
    r = await http.get(
        "/api/oauth/authorize",
        params={
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": CALLBACK,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "state": state,
            "scope": "board",
            "resource": f"{BASE}/api/mcp",
        },
    )
    assert r.status_code in (302, 303, 307), r.text
    consent_url = urlparse(r.headers["location"])
    assert consent_url.path == "/oauth/consent"
    req = parse_qs(consent_url.query)["req"][0]

    # --- the SPA shows who is asking, the user approves ---
    assert (await http.get("/api/oauth/consent", params={"req": req})).status_code == 401  # must be logged in
    info = (await http.get("/api/oauth/consent", params={"req": req}, headers=user_headers)).json()
    assert info == {"client_name": "Claude", "scopes": ["board"], "redirect_host": "claude.ai"}
    r = await http.post("/api/oauth/consent", json={"req": req, "approve": True}, headers=user_headers)
    assert r.status_code == 200, r.text
    redirect = urlparse(r.json()["redirect_to"])
    assert redirect.netloc == "claude.ai"
    q = parse_qs(redirect.query)
    assert q["state"] == [state]
    code = q["code"][0]

    # --- token exchange (PKCE verified by the SDK) ---
    bad = await http.post(
        "/api/oauth/token",
        data={
            "grant_type": "authorization_code",
            "code": code,
            "code_verifier": "wrong" * 10,
            "client_id": client_id,
            "redirect_uri": CALLBACK,
        },
    )
    assert bad.status_code == 400 and bad.json()["error"] == "invalid_grant"
    r = await http.post(
        "/api/oauth/token",
        data={
            "grant_type": "authorization_code",
            "code": code,
            "code_verifier": verifier,
            "client_id": client_id,
            "redirect_uri": CALLBACK,
            "resource": f"{BASE}/api/mcp",
        },
    )
    assert r.status_code == 200, r.text
    tokens = r.json()
    assert tokens["token_type"].lower() == "bearer" and tokens["expires_in"] == 3600 and tokens["refresh_token"]
    # code is single use
    again = await http.post(
        "/api/oauth/token",
        data={
            "grant_type": "authorization_code",
            "code": code,
            "code_verifier": verifier,
            "client_id": client_id,
            "redirect_uri": CALLBACK,
        },
    )
    assert again.status_code == 400

    # --- refresh with rotation ---
    r = await http.post(
        "/api/oauth/token", data={"grant_type": "refresh_token", "refresh_token": tokens["refresh_token"], "client_id": client_id}
    )
    assert r.status_code == 200, r.text
    rotated = r.json()
    assert rotated["access_token"] != tokens["access_token"] and rotated["refresh_token"] != tokens["refresh_token"]
    r = await http.post(
        "/api/oauth/token", data={"grant_type": "refresh_token", "refresh_token": tokens["refresh_token"], "client_id": client_id}
    )
    assert r.status_code == 400 and r.json()["error"] == "invalid_grant"
    # the old access token is still valid until it expires; the rotated one works too
    return {"client_id": client_id, **rotated, "first_access_token": tokens["access_token"]}


async def _mcp(access_token: str) -> Client:
    http = _asgi_client({"Authorization": f"Bearer {access_token}"})
    return Client(streamable_http_client(f"{BASE}/api/mcp", http_client=http))


def _data(result: Any) -> Any:
    """Unwrap a tool result into plain data (structured content when present, else parsed text)."""
    if getattr(result, "structured_content", None):
        sc = result.structured_content
        return sc["result"] if isinstance(sc, dict) and "result" in sc else sc
    import json

    return json.loads(result.content[0].text)


async def _run() -> None:
    async with app.router.lifespan_context(app):
        async with _asgi_client() as http:
            daniel, daniel_id = await _login(http, "daniel")
            peera, _ = await _login(http, "peera")
            flow = await _oauth_flow(http, daniel)

            # --- MCP tools as Dániel ---
            async with await _mcp(flow["access_token"]) as mcp:
                tools = {t.name for t in (await mcp.list_tools()).tools}
                assert {
                    "list_boards",
                    "get_board",
                    "get_card",
                    "search_cards",
                    "list_users",
                    "create_card",
                    "update_card",
                    "move_card",
                    "add_comment",
                    "create_column",
                } <= tools
                boards = _data(await mcp.call_tool("list_boards", {}))
                assert boards[0]["title"] == "Lucrum Backtesting Platform" and len(boards[0]["members"]) == 12
                board = _data(await mcp.call_tool("get_board", {"board_id": boards[0]["id"]}))
                todo, doing = board["columns"][0], board["columns"][1]
                member_ids = [m["id"] for m in board["members"]]

                created = _data(
                    await mcp.call_tool(
                        "create_card",
                        {
                            "column_id": todo["id"],
                            "title": "From Claude",
                            "description": "via MCP",
                            "due_date": "2026-12-24",
                            "assignee_ids": member_ids[:2],
                        },
                    )
                )
                assert created["column"] == todo["title"] and created["due_date"] == "2026-12-24" and len(created["assignees"]) == 2
                moved = _data(await mcp.call_tool("move_card", {"card_id": created["id"], "column_id": doing["id"], "position": 0}))
                assert moved["column"] == doing["title"] and moved["position"] == 0
                comment = _data(await mcp.call_tool("add_comment", {"card_id": created["id"], "body": "hello from claude"}))
                assert comment["author"] == "Dániel Gergely"
                updated = _data(
                    await mcp.call_tool("update_card", {"card_id": created["id"], "clear_due_date": True, "reviewer_ids": [daniel_id]})
                )
                assert updated["due_date"] is None and [r["id"] for r in updated["reviewers"]] == [daniel_id]
                found = _data(await mcp.call_tool("search_cards", {"text": "from claude", "reviewer": "me"}))
                assert [c["id"] for c in found] == [created["id"]] and found[0]["comment_count"] == 1
                overdue = _data(await mcp.call_tool("search_cards", {"overdue": True}))
                assert overdue == []  # the only past-due seeded card sits in Done
                card = _data(await mcp.call_tool("get_card", {"card_id": created["id"]}))
                assert card["comments"][0]["body"] == "hello from claude" and card["column"] == doing["title"]
                col = _data(await mcp.call_tool("create_column", {"board_id": board["id"], "title": "Blocked"}))
                assert col["position"] == 4
                # invalid input surfaces as a tool error, not a crash
                err = await mcp.call_tool("create_card", {"column_id": todo["id"], "title": "x", "due_date": "tomorrow"})
                assert err.is_error and "YYYY-MM-DD" in err.content[0].text
                err = await mcp.call_tool("create_card", {"column_id": 999999, "title": "x"})
                assert err.is_error and "Column not found" in err.content[0].text

            # REST sees exactly what MCP did (same services, same DB)
            r = await http.get(f"/api/boards/{board['id']}", headers=daniel)
            assert [c["title"] for c in r.json()["columns"][1]["cards"]][0] == "From Claude"
            assert [c["title"] for c in r.json()["columns"]][-1] == "Blocked"

            # --- access control holds across MCP: Peera cannot see Dániel's private board ---
            private = (await http.post("/api/boards", json={"title": "Private"}, headers=daniel)).json()
            r = await http.post("/api/tokens", json={"name": "Claude Code"}, headers=peera)
            assert r.status_code == 201 and r.json()["token"].startswith("tb_pat_") and r.json()["prefix"] == r.json()["token"][:12]
            peera_token = r.json()["token"]
            async with await _mcp(peera_token) as mcp:
                mine = _data(await mcp.call_tool("list_boards", {}))
                assert private["id"] not in {b["id"] for b in mine}
                err = await mcp.call_tool("get_board", {"board_id": private["id"]})
                assert err.is_error and "not a member" in err.content[0].text
            listed = (await http.get("/api/tokens", headers=peera)).json()
            assert listed[0]["name"] == "Claude Code" and listed[0]["last_used_at"] is not None and "token" not in listed[0]

            # revoked / bogus tokens are refused with 401
            assert (await http.delete(f"/api/tokens/{listed[0]['id']}", headers=peera)).status_code == 204
            assert (await http.get("/api/tokens", headers=peera)).json() == []
            for bad in (peera_token, "tb_pat_nonsense"):
                r = await http.post(
                    "/api/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"}, headers={"Authorization": f"Bearer {bad}"}
                )
                assert r.status_code == 401, bad
            # the consent endpoint rejects tampered requests
            r = await http.post("/api/oauth/consent", json={"req": "garbage", "approve": True}, headers=daniel)
            assert r.status_code == 400
            info = (await http.get("/api/mcp-info", headers=daniel)).json()
            assert info == {"mcp_url": f"{BASE}/api/mcp", "oauth_enabled": True, "public_url": BASE}


def test_oauth_and_mcp_end_to_end():
    reset_database()
    asyncio.run(_run())
