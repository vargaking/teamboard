import copy

from fastapi.testclient import TestClient

from tests.conftest import login

# Shape follows a real "Export as JSON" from Trello (only the fields the importer reads).
TRELLO = {
    "name": "Lucrum sprint (Trello)",
    "desc": "Imported board",
    "lists": [
        {"id": "L2", "name": "Doing", "closed": False, "pos": 2000},
        {"id": "L1", "name": "Backlog", "closed": False, "pos": 1000},
        {"id": "L3", "name": "Old stuff", "closed": True, "pos": 3000},
    ],
    "labels": [
        {"id": "LB1", "name": "bug", "color": "red"},
        {"id": "LB2", "name": "", "color": "sky_dark"},
        {"id": "LB3", "name": "unused", "color": "green"},
    ],
    "members": [
        {"id": "M1", "fullName": "Miki Petkovic", "username": "mikip"},
        {"id": "M2", "fullName": "Someone External", "username": "ext"},
        {"id": "M3", "fullName": "Izzet", "username": "izzet"},
    ],
    "checklists": [
        {
            "id": "CK1",
            "idCard": "C1",
            "name": "Definition of done",
            "pos": 1,
            "checkItems": [{"name": "Tests pass", "state": "complete", "pos": 2}, {"name": "Reviewed", "state": "incomplete", "pos": 1}],
        }
    ],
    "cards": [
        {
            "id": "C1",
            "name": "Set up CI",
            "desc": "Pipeline for the repo.",
            "idList": "L1",
            "closed": False,
            "pos": 200,
            "due": "2026-11-05T12:00:00.000Z",
            "idLabels": ["LB1", "LB2"],
            "idMembers": ["M1", "M2"],
            "attachments": [{"name": "spec", "url": "https://example.com/spec.pdf"}, {"name": "bad", "url": "javascript:alert(1)"}],
        },
        {
            "id": "C2",
            "name": "Write URD",
            "desc": "",
            "idList": "L1",
            "closed": False,
            "pos": 100,
            "due": None,
            "idLabels": [],
            "idMembers": ["M3"],
        },
        {"id": "C3", "name": "Archived card", "desc": "", "idList": "L1", "closed": True, "pos": 300, "idLabels": [], "idMembers": []},
        {"id": "C4", "name": "In old list", "desc": "", "idList": "L3", "closed": False, "pos": 100, "idLabels": [], "idMembers": []},
        {"id": "C5", "name": "Doing it", "desc": "", "idList": "L2", "closed": False, "pos": 100, "idLabels": ["LB1"], "idMembers": []},
        {"id": "C6", "name": "Orphan", "desc": "", "idList": "NOPE", "closed": False, "pos": 1, "idLabels": [], "idMembers": []},
    ],
    "actions": [
        {
            "type": "commentCard",
            "date": "2026-10-02T10:00:00.000Z",
            "data": {"text": "Second comment", "card": {"id": "C1"}},
            "memberCreator": {"id": "M2", "fullName": "Someone External"},
        },
        {
            "type": "commentCard",
            "date": "2026-10-01T10:00:00.000Z",
            "data": {"text": "First comment", "card": {"id": "C1"}},
            "memberCreator": {"id": "M1", "fullName": "Miki Petkovic"},
        },
        {"type": "updateCard", "date": "2026-10-03T10:00:00.000Z", "data": {"card": {"id": "C1"}}},
    ],
}


def test_preview_summary_and_member_suggestions(client: TestClient):
    h = login(client, "daniel")
    users = {u["email"]: u["id"] for u in client.get("/api/users", headers=h).json()}
    r = client.post("/api/boards/import/trello/preview", json={"export": TRELLO}, headers=h)
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["title"] == "Lucrum sprint (Trello)"
    assert [lst["name"] for lst in p["lists"]] == ["Backlog", "Doing", "Old stuff"]  # Trello pos order
    assert p["lists"][2]["archived"] is True and p["lists"][0]["card_count"] == 3
    assert p["card_count"] == 4 and p["archived_card_count"] == 1  # orphan card (unknown list) dropped
    assert p["label_count"] == 3 and p["comment_count"] == 2 and p["checklist_count"] == 1
    members = {m["trello_id"]: m for m in p["members"]}
    assert members["M1"]["suggested_user_id"] == users["miki@teamboard.local"]  # full-name match
    assert members["M3"]["suggested_user_id"] == users["izzet@teamboard.local"]  # unique first-name match
    assert members["M2"]["suggested_user_id"] is None and members["M2"]["card_count"] == 1
    # not a Trello export
    assert client.post("/api/boards/import/trello/preview", json={"export": {"foo": 1}}, headers=h).status_code == 422
    assert client.post("/api/boards/import/trello/preview", json={"export": TRELLO}).status_code == 401


def test_import_creates_faithful_board(client: TestClient):
    h = login(client, "daniel")
    users = {u["email"]: u["id"] for u in client.get("/api/users", headers=h).json()}
    me = client.get("/api/auth/me", headers=h).json()["id"]
    miki = users["miki@teamboard.local"]
    r = client.post(
        "/api/boards/import/trello",
        json={"export": TRELLO, "options": {"title": "Imported sprint", "member_map": {"M1": miki, "M2": 999999}}},
        headers=h,
    )
    assert r.status_code == 400 and "999999" in r.json()["detail"]  # unknown user rejected, nothing created
    assert len(client.get("/api/boards", headers=h).json()) == 1

    r = client.post(
        "/api/boards/import/trello", json={"export": TRELLO, "options": {"title": "Imported sprint", "member_map": {"M1": miki}}}, headers=h
    )
    assert r.status_code == 201, r.text
    board = r.json()
    assert board["title"] == "Imported sprint" and board["description"] == "Imported board" and board["owner_id"] == me
    assert sorted(u["id"] for u in board["members"]) == sorted([me, miki])
    # archived list and archived card skipped by default; columns in Trello order; cards in pos order
    assert [c["title"] for c in board["columns"]] == ["Backlog", "Doing"]
    backlog, doing = board["columns"]
    assert [c["title"] for c in backlog["cards"]] == ["Write URD", "Set up CI"] and [c["position"] for c in backlog["cards"]] == [0, 1]
    assert [c["title"] for c in doing["cards"]] == ["Doing it"]
    # only labels that are used get created; unnamed label is named after its colour; colours mapped to hex
    assert sorted((lab["name"], lab["color"]) for lab in board["labels"]) == [("bug", "#eb5a46"), ("sky dark", "#00c2e0")]
    card = backlog["cards"][1]
    assert card["due_date"] == "2026-11-05"
    assert sorted(lab["name"] for lab in card["labels"]) == ["bug", "sky dark"]
    assert [u["id"] for u in card["assignees"]] == [miki]  # unmapped Trello member dropped
    assert "## Definition of done\n- [ ] Reviewed\n- [x] Tests pass" in card["description"]
    assert "[spec](https://example.com/spec.pdf)" in card["description"] and "javascript:" not in card["description"]
    assert card["comment_count"] == 2
    comments = client.get(f"/api/cards/{card['id']}/comments", headers=h).json()
    assert [c["body"] for c in comments] == ["First comment", "Someone External (Trello): Second comment"]
    assert comments[0]["author"]["id"] == miki and comments[1]["author"]["id"] == me
    assert comments[0]["created_at"].startswith("2026-10-01")
    # Izzet (M3) was not mapped -> not assigned, not a member
    assert backlog["cards"][0]["assignees"] == []

    # include_archived brings the archived list and card along
    r = client.post("/api/boards/import/trello", json={"export": TRELLO, "options": {"include_archived": True}}, headers=h)
    assert r.status_code == 201
    full = r.json()
    assert full["title"] == "Lucrum sprint (Trello)"
    assert [c["title"] for c in full["columns"]] == ["Backlog", "Doing", "Old stuff"]
    assert [c["title"] for c in full["columns"][0]["cards"]] == ["Write URD", "Set up CI", "Archived card"]
    assert [c["title"] for c in full["columns"][2]["cards"]] == ["In old list"]


def test_import_rejects_garbage_and_too_many_cards(client: TestClient):
    h = login(client, "daniel")
    assert client.post("/api/boards/import/trello", json={"export": [1, 2, 3]}, headers=h).status_code == 422
    huge = copy.deepcopy(TRELLO)
    huge["cards"] = [{"id": f"X{i}", "name": "x", "idList": "L1", "pos": i} for i in range(5001)]
    r = client.post("/api/boards/import/trello/preview", json={"export": huge}, headers=h)
    assert r.status_code == 422 and "limit" in r.json()["detail"]
