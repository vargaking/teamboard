import json

from fastapi.testclient import TestClient

from tests.conftest import login


def card_ids(board: dict, column_index: int) -> list[int]:
    return [c["id"] for c in board["columns"][column_index]["cards"]]


def positions(board: dict, column_index: int) -> list[int]:
    return [c["position"] for c in board["columns"][column_index]["cards"]]


def test_login_and_me(client: TestClient):
    bad = client.post("/api/auth/login", json={"email": "daniel@teamboard.local", "password": "wrong"})
    assert bad.status_code == 401
    assert client.get("/api/auth/me").status_code == 401
    h = login(client, "daniel")
    me = client.get("/api/auth/me", headers=h).json()
    assert me["email"] == "daniel@teamboard.local" and me["is_admin"] is True and me["initials"] == "DG"
    assert len(client.get("/api/users", headers=h).json()) == 12


def test_seeded_demo_board_and_membership(client: TestClient):
    h = login(client, "miki")
    boards = client.get("/api/boards", headers=h).json()
    assert len(boards) == 1 and len(boards[0]["member_ids"]) == 12
    board = client.get(f"/api/boards/{boards[0]['id']}", headers=h).json()
    assert [c["title"] for c in board["columns"]] == ["To do", "In progress", "Review", "Done"]
    assert positions(board, 0) == [0, 1, 2]
    assert board["columns"][0]["cards"][0]["labels"][0]["name"] == "backend"


def test_board_access_control(client: TestClient):
    owner = login(client, "izzet")
    other = login(client, "peera")
    admin = login(client, "daniel")
    r = client.post("/api/boards", json={"title": "Private", "description": ""}, headers=owner)
    assert r.status_code == 201
    bid = r.json()["id"]
    assert len(r.json()["columns"]) == 4
    assert client.get(f"/api/boards/{bid}", headers=other).status_code == 403
    assert client.get(f"/api/boards/{bid}", headers=admin).status_code == 200
    assert client.get("/api/boards/999999", headers=owner).status_code == 404
    # add member, then only owner/admin may delete
    uid_other = client.get("/api/auth/me", headers=other).json()["id"]
    r = client.put(f"/api/boards/{bid}/members", json={"user_ids": [uid_other]}, headers=owner)
    assert r.status_code == 200 and len(r.json()["members"]) == 2  # owner is kept
    assert client.get(f"/api/boards/{bid}", headers=other).status_code == 200
    assert client.delete(f"/api/boards/{bid}", headers=other).status_code == 403
    assert client.delete(f"/api/boards/{bid}", headers=owner).status_code == 204
    assert client.get(f"/api/boards/{bid}", headers=owner).status_code == 404


def test_card_lifecycle_and_move(client: TestClient):
    h = login(client, "daniel")
    bid = client.post("/api/boards", json={"title": "Sprint 1"}, headers=h).json()["id"]
    board = client.get(f"/api/boards/{bid}", headers=h).json()
    todo, doing = board["columns"][0]["id"], board["columns"][1]["id"]
    me = client.get("/api/auth/me", headers=h).json()["id"]

    label = client.post(f"/api/boards/{bid}/labels", json={"name": "bug", "color": "#FF0000"}, headers=h).json()
    assert label["color"] == "#ff0000"
    ids = []
    for i in range(3):
        r = client.post(
            f"/api/columns/{todo}/cards", json={"title": f"card {i}", "assignee_ids": [me], "label_ids": [label["id"]]}, headers=h
        )
        assert r.status_code == 201, r.text
        ids.append(r.json()["id"])
    board = client.get(f"/api/boards/{bid}", headers=h).json()
    assert card_ids(board, 0) == ids and positions(board, 0) == [0, 1, 2]

    # move last card to the front of the same column
    board = client.post(f"/api/cards/{ids[2]}/move", json={"column_id": todo, "position": 0}, headers=h).json()
    assert card_ids(board, 0) == [ids[2], ids[0], ids[1]] and positions(board, 0) == [0, 1, 2]
    # move the first card to another column at index 0, then another at the end (position beyond length is clamped)
    board = client.post(f"/api/cards/{ids[2]}/move", json={"column_id": doing, "position": 0}, headers=h).json()
    assert card_ids(board, 0) == [ids[0], ids[1]] and card_ids(board, 1) == [ids[2]]
    board = client.post(f"/api/cards/{ids[0]}/move", json={"column_id": doing, "position": 99}, headers=h).json()
    assert card_ids(board, 0) == [ids[1]] and card_ids(board, 1) == [ids[2], ids[0]]
    assert positions(board, 0) == [0] and positions(board, 1) == [0, 1]

    # update: clear due date explicitly, replace assignees with empty set
    r = client.patch(f"/api/cards/{ids[1]}", json={"due_date": "2026-12-01"}, headers=h)
    assert r.json()["due_date"] == "2026-12-01"
    r = client.patch(f"/api/cards/{ids[1]}", json={"title": "renamed"}, headers=h)
    assert r.json()["due_date"] == "2026-12-01" and r.json()["title"] == "renamed"  # omitted field untouched
    r = client.patch(f"/api/cards/{ids[1]}", json={"due_date": None, "assignee_ids": []}, headers=h)
    assert r.json()["due_date"] is None and r.json()["assignees"] == []
    # assignee must be a board member
    outsider = client.get("/api/auth/me", headers=login(client, "peera")).json()["id"]
    assert client.patch(f"/api/cards/{ids[1]}", json={"assignee_ids": [outsider]}, headers=h).status_code == 400
    assert client.post(f"/api/cards/{ids[1]}/move", json={"column_id": 999999, "position": 0}, headers=h).status_code == 400

    # comments
    r = client.post(f"/api/cards/{ids[1]}/comments", json={"body": "hello"}, headers=h)
    assert r.status_code == 201 and r.json()["author"]["id"] == me
    assert client.get(f"/api/cards/{ids[1]}/comments", headers=h).json()[0]["body"] == "hello"
    board = client.get(f"/api/boards/{bid}", headers=h).json()
    assert board["columns"][0]["cards"][0]["comment_count"] == 1
    assert client.delete(f"/api/comments/{r.json()['id']}", headers=h).status_code == 204

    # delete card renumbers, delete column cascades
    assert client.delete(f"/api/cards/{ids[2]}", headers=h).status_code == 204
    board = client.get(f"/api/boards/{bid}", headers=h).json()
    assert card_ids(board, 1) == [ids[0]] and positions(board, 1) == [0]
    assert client.delete(f"/api/columns/{doing}", headers=h).status_code == 204
    board = client.get(f"/api/boards/{bid}", headers=h).json()
    assert [c["position"] for c in board["columns"]] == [0, 1, 2]
    assert client.get(f"/api/cards/{ids[0]}/comments", headers=h).status_code == 404


def test_columns_create_rename_reorder(client: TestClient):
    h = login(client, "andrei")
    bid = client.post("/api/boards", json={"title": "Cols"}, headers=h).json()["id"]
    r = client.post(f"/api/boards/{bid}/columns", json={"title": "Blocked"}, headers=h)
    assert r.status_code == 201 and r.json()["position"] == 4
    new_id = r.json()["id"]
    assert client.patch(f"/api/columns/{new_id}", json={"title": "Waiting"}, headers=h).json()["title"] == "Waiting"
    ids = [c["id"] for c in client.get(f"/api/boards/{bid}", headers=h).json()["columns"]]
    reordered = list(reversed(ids))
    board = client.put(f"/api/boards/{bid}/columns/order", json={"column_ids": reordered}, headers=h).json()
    assert [c["id"] for c in board["columns"]] == reordered
    assert [c["position"] for c in board["columns"]] == [0, 1, 2, 3, 4]
    assert client.put(f"/api/boards/{bid}/columns/order", json={"column_ids": reordered[:-1]}, headers=h).status_code == 400
    assert client.post(f"/api/boards/{bid}/columns", json={"title": "   "}, headers=h).status_code == 422


def test_removed_member_is_unassigned(client: TestClient):
    h = login(client, "gergo")
    other_h = login(client, "botond")
    other = client.get("/api/auth/me", headers=other_h).json()["id"]
    b = client.post("/api/boards", json={"title": "M"}, headers=h).json()
    client.put(f"/api/boards/{b['id']}/members", json={"user_ids": [other]}, headers=h)
    col = b["columns"][0]["id"]
    card = client.post(f"/api/columns/{col}/cards", json={"title": "x", "assignee_ids": [other]}, headers=h).json()
    assert [u["id"] for u in card["assignees"]] == [other]
    board = client.put(f"/api/boards/{b['id']}/members", json={"user_ids": []}, headers=h).json()
    assert board["columns"][0]["cards"][0]["assignees"] == []


def test_reviewers(client: TestClient):
    h = login(client, "ramtin")
    rev_h = login(client, "andrada")
    reviewer = client.get("/api/auth/me", headers=rev_h).json()["id"]
    me = client.get("/api/auth/me", headers=h).json()["id"]
    b = client.post("/api/boards", json={"title": "R"}, headers=h).json()
    col = b["columns"][0]["id"]
    # reviewer must be a member
    assert client.post(f"/api/columns/{col}/cards", json={"title": "x", "reviewer_ids": [reviewer]}, headers=h).status_code == 400
    client.put(f"/api/boards/{b['id']}/members", json={"user_ids": [reviewer]}, headers=h)
    card = client.post(f"/api/columns/{col}/cards", json={"title": "x", "assignee_ids": [me], "reviewer_ids": [reviewer]}, headers=h).json()
    assert [u["id"] for u in card["reviewers"]] == [reviewer] and [u["id"] for u in card["assignees"]] == [me]
    # patch without reviewer_ids keeps them; explicit [] clears them
    card = client.patch(f"/api/cards/{card['id']}", json={"title": "y"}, headers=h).json()
    assert [u["id"] for u in card["reviewers"]] == [reviewer]
    card = client.patch(f"/api/cards/{card['id']}", json={"reviewer_ids": [reviewer, me]}, headers=h).json()
    assert sorted(u["id"] for u in card["reviewers"]) == sorted([reviewer, me])
    # removing a member drops them as reviewer too
    board = client.put(f"/api/boards/{b['id']}/members", json={"user_ids": []}, headers=h).json()
    assert [u["id"] for u in board["columns"][0]["cards"][0]["reviewers"]] == [me]
    card = client.patch(f"/api/cards/{card['id']}", json={"reviewer_ids": []}, headers=h).json()
    assert card["reviewers"] == []
    # seeded demo: the Review column card has a reviewer
    demo = client.get("/api/boards", headers=login(client, "daniel")).json()
    demo_board = client.get(f"/api/boards/{min(x['id'] for x in demo)}", headers=login(client, "daniel")).json()
    assert len(demo_board["columns"][2]["cards"][0]["reviewers"]) == 1


def test_change_password(client: TestClient):
    h = login(client, "vladimir")
    assert (
        client.post("/api/auth/change-password", json={"current_password": "nope", "new_password": "longenough1"}, headers=h).status_code
        == 400
    )
    assert (
        client.post(
            "/api/auth/change-password", json={"current_password": "changeme", "new_password": "longenough1"}, headers=h
        ).status_code
        == 200
    )
    assert client.post("/api/auth/login", json={"email": "vladimir@teamboard.local", "password": "longenough1"}).status_code == 200


def test_websocket_live_updates(client: TestClient):
    h = login(client, "daniel")
    token = h["Authorization"].split()[1]
    bid = client.post("/api/boards", json={"title": "Live"}, headers=h).json()["id"]
    col = client.get(f"/api/boards/{bid}", headers=h).json()["columns"][0]["id"]
    me = client.get("/api/auth/me", headers=h).json()["id"]

    with client.websocket_connect(f"/api/ws/boards/{bid}?token={token}") as ws:
        ws.send_text("ping")
        assert ws.receive_text() == "pong"
        card = client.post(f"/api/columns/{col}/cards", json={"title": "pushed"}, headers=h).json()
        msg = json.loads(ws.receive_text())
        assert msg == {"type": "board.updated", "board_id": bid, "event": "card.created", "actor_id": me, "entity_id": card["id"]}
        client.post(f"/api/cards/{card['id']}/move", json={"column_id": col, "position": 0}, headers=h)
        assert json.loads(ws.receive_text())["event"] == "card.moved"
        assert client.get("/api/health").json()["websocket_connections"] == 1

    with client.websocket_connect(f"/api/ws/boards?token={token}") as ws:
        client.delete(f"/api/boards/{bid}", headers=h)
        assert json.loads(ws.receive_text()) == {"type": "board.deleted", "board_id": bid}
    assert client.get("/api/health").json()["websocket_connections"] == 0

    # auth failures close with custom codes
    from starlette.websockets import WebSocketDisconnect

    for url, code in [(f"/api/ws/boards/{bid}?token=bad", 4401), (f"/api/ws/boards/{bid}?token={token}", 4404)]:
        try:
            with client.websocket_connect(url) as ws:
                ws.receive_text()
            raise AssertionError("expected close")
        except WebSocketDisconnect as exc:
            assert exc.code == code
    outsider_token = login(client, "peera")["Authorization"].split()[1]
    private = client.post("/api/boards", json={"title": "P"}, headers=h).json()["id"]
    try:
        with client.websocket_connect(f"/api/ws/boards/{private}?token={outsider_token}") as ws:
            ws.receive_text()
        raise AssertionError("expected close")
    except WebSocketDisconnect as exc:
        assert exc.code == 4403
