from fastapi.testclient import TestClient

from tests.conftest import login


def test_admin_user_management(client: TestClient):
    admin = login(client, "daniel")
    member = login(client, "miki")
    # non-admins cannot manage users
    assert (
        client.post("/api/users", json={"email": "x@teamboard.local", "name": "X", "password": "password123"}, headers=member).status_code
        == 403
    )
    r = client.post("/api/users", json={"email": "New.Person@Example.com", "name": "New Person", "password": "password123"}, headers=admin)
    assert r.status_code == 201, r.text
    created = r.json()
    assert created["email"] == "new.person@example.com" and created["initials"] == "NP" and created["is_admin"] is False
    assert created["color"].startswith("#") and len(created["color"]) == 7
    assert (
        client.post(
            "/api/users", json={"email": "new.person@example.com", "name": "Dup", "password": "password123"}, headers=admin
        ).status_code
        == 409
    )
    # the new user can log in with the given password; admin can reset it
    assert client.post("/api/auth/login", json={"email": "new.person@example.com", "password": "password123"}).status_code == 200
    r = client.patch(
        f"/api/users/{created['id']}", json={"password": "anotherpass9", "is_admin": True, "name": "Renamed Person"}, headers=admin
    )
    assert r.json()["is_admin"] is True and r.json()["name"] == "Renamed Person" and r.json()["initials"] == "RP"
    assert client.post("/api/auth/login", json={"email": "new.person@example.com", "password": "password123"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "new.person@example.com", "password": "anotherpass9"}).status_code == 200
    # an admin cannot demote themselves; a short password is rejected
    me = client.get("/api/auth/me", headers=admin).json()["id"]
    assert client.patch(f"/api/users/{me}", json={"is_admin": False}, headers=admin).status_code == 400
    assert client.patch(f"/api/users/{created['id']}", json={"password": "short"}, headers=admin).status_code == 422
    assert client.patch("/api/users/999999", json={"name": "x"}, headers=admin).status_code == 404
    assert len(client.get("/api/users", headers=member).json()) == 13


def test_invite_flow(client: TestClient):
    admin = login(client, "daniel")
    board = client.get("/api/boards", headers=admin).json()[0]
    assert client.post("/api/invites", json={}, headers=login(client, "miki")).status_code == 403
    assert client.post("/api/invites", json={"board_id": 999999}, headers=admin).status_code == 404
    assert client.post("/api/invites", json={"email": "miki@teamboard.local"}, headers=admin).status_code == 409

    r = client.post(
        "/api/invites", json={"email": "Anna@example.com", "name": "Anna", "board_id": board["id"], "expires_in_days": 3}, headers=admin
    )
    assert r.status_code == 201, r.text
    invite = r.json()
    assert invite["url"].startswith("http://localhost:8080/invite/") and invite["board_title"] == board["title"] and invite["max_uses"] == 1
    token = invite["url"].rsplit("/", 1)[1]
    # the token is never returned again
    listed = client.get("/api/invites", headers=admin).json()
    assert listed[0]["id"] == invite["id"] and listed[0]["url"] is None and listed[0]["uses"] == 0

    # public info
    info = client.get(f"/api/invites/{token}/info").json()
    assert info == {
        "valid": True,
        "reason": None,
        "email": "anna@example.com",
        "name": "Anna",
        "board_title": board["title"],
        "invited_by": "Dániel Gergely",
    }
    assert client.get("/api/invites/nope/info").json()["valid"] is False

    # wrong e-mail for a targeted invite, then accept
    bad = client.post(f"/api/invites/{token}/accept", json={"name": "Anna", "email": "other@example.com", "password": "password123"})
    assert bad.status_code == 400
    r = client.post(f"/api/invites/{token}/accept", json={"name": "Anna Example", "email": "anna@example.com", "password": "password123"})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["email"] == "anna@example.com" and r.json()["user"]["is_admin"] is False
    anna = {"Authorization": f"Bearer {r.json()['access_token']}"}
    # logged in and already a member of the board
    boards = client.get("/api/boards", headers=anna).json()
    assert [b["id"] for b in boards] == [board["id"]]
    # single use: a second accept is refused
    r = client.post(f"/api/invites/{token}/accept", json={"name": "Someone", "email": "someone@example.com", "password": "password123"})
    assert r.status_code == 410 and client.get(f"/api/invites/{token}/info").json()["reason"] == "This invite has already been used."

    # open multi-use invite, then revoke it
    r = client.post("/api/invites", json={"max_uses": 5}, headers=admin)
    open_token = r.json()["url"].rsplit("/", 1)[1]
    assert client.get(f"/api/invites/{open_token}/info").json()["email"] is None
    r = client.post(f"/api/invites/{open_token}/accept", json={"name": "Bob", "email": "bob@example.com", "password": "password123"})
    assert r.status_code == 200 and client.get("/api/boards", headers={"Authorization": f"Bearer {r.json()['access_token']}"}).json() == []
    assert (
        client.post(
            f"/api/invites/{open_token}/accept", json={"name": "Bob2", "email": "bob@example.com", "password": "password123"}
        ).status_code
        == 409
    )
    assert (
        client.delete(
            f"/api/invites/{r.status_code and client.get('/api/invites', headers=admin).json()[0]['id']}", headers=admin
        ).status_code
        == 204
    )
    assert client.get(f"/api/invites/{open_token}/info").json()["reason"] == "This invite was revoked."
    assert (
        client.post(
            f"/api/invites/{open_token}/accept", json={"name": "C", "email": "c@example.com", "password": "password123"}
        ).status_code
        == 410
    )
    assert client.delete("/api/invites/999999", headers=admin).status_code == 404
