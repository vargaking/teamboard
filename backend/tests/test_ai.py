from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.ai import crypto, providers
from app.ai.providers import AIProviderError, Credentials, ModelInfo
from tests.conftest import login


def test_crypto_roundtrip():
    token = crypto.encrypt("sk-ant-secret")
    assert token != "sk-ant-secret" and crypto.decrypt(token) == "sk-ant-secret"
    assert crypto.decrypt("not-a-token") is None


def test_settings_lifecycle(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    h = login(client, "miki")
    assert client.get("/api/ai/settings", headers=h).json() == {"provider": None, "model": None, "has_key": False, "key_hint": None}
    # not configured -> 409 on every feature
    board = client.get("/api/boards", headers=h).json()[0]
    assert client.post(f"/api/ai/boards/{board['id']}/summary", headers=h).status_code == 409
    assert client.get("/api/ai/models", headers=h).status_code == 409
    # first PUT needs a key
    assert client.put("/api/ai/settings", json={"provider": "anthropic"}, headers=h).status_code == 400
    r = client.put("/api/ai/settings", json={"provider": "anthropic", "api_key": "sk-ant-api03-abcdef1234"}, headers=h)
    assert r.status_code == 200 and r.json() == {"provider": "anthropic", "model": None, "has_key": True, "key_hint": "…1234"}
    # model missing -> still 409 for features, but models can be listed with the stored key
    assert client.post(f"/api/ai/boards/{board['id']}/summary", headers=h).status_code == 409

    seen: dict[str, Any] = {}

    async def fake_list(provider: str, api_key: str) -> list[ModelInfo]:
        seen.update(provider=provider, api_key=api_key)
        return [ModelInfo(id="claude-x", label="Claude X")]

    monkeypatch.setattr(providers, "list_models", fake_list)
    assert client.get("/api/ai/models", headers=h).json() == [{"id": "claude-x", "label": "Claude X"}]
    assert seen == {"provider": "anthropic", "api_key": "sk-ant-api03-abcdef1234"}  # decrypted server-side only
    # set model, keep key
    r = client.put("/api/ai/settings", json={"provider": "anthropic", "model": "claude-x"}, headers=h)
    assert r.json()["model"] == "claude-x" and r.json()["key_hint"] == "…1234"
    # switching provider without a new key is refused; with a key it resets the model
    assert client.put("/api/ai/settings", json={"provider": "openai"}, headers=h).status_code == 400
    r = client.put("/api/ai/settings", json={"provider": "openai", "api_key": "sk-proj-zzzzzzzz9999"}, headers=h)
    assert r.json() == {"provider": "openai", "model": None, "has_key": True, "key_hint": "…9999"}
    # settings are per user
    assert client.get("/api/ai/settings", headers=login(client, "izzet")).json()["has_key"] is False
    assert client.delete("/api/ai/settings", headers=h).status_code == 204
    assert client.get("/api/ai/settings", headers=h).json()["has_key"] is False


def _configure(client: TestClient, h: dict[str, str]) -> None:
    client.put("/api/ai/settings", json={"provider": "openai", "api_key": "sk-proj-testkey12345", "model": "gpt-test"}, headers=h)


def test_card_assist_and_validation(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    h = login(client, "daniel")
    _configure(client, h)
    board = client.get(f"/api/boards/{client.get('/api/boards', headers=h).json()[0]['id']}", headers=h).json()
    card = board["columns"][0]["cards"][0]
    real_label = board["labels"][0]
    calls: list[dict[str, Any]] = []

    async def fake_json(
        creds: Credentials, system: str, user: str, schema: dict[str, Any], name: str, max_tokens: int = 0
    ) -> dict[str, Any]:
        calls.append({"creds": creds, "user": user, "name": name})
        if name == "card_labels":
            # one real id, one bogus id, one new label duplicating an existing name (case-insensitive), one genuinely new
            return {
                "label_ids": [real_label["id"], 999999, real_label["id"]],
                "new_labels": [{"name": real_label["name"].upper(), "color": "#000000"}, {"name": "infra", "color": "#ABCDEF"}],
            }
        if name == "card_subtasks":
            return {"subtasks": [{"title": "Write Dockerfile", "description": "multi-stage"}, {"title": "Add CI", "description": ""}]}
        if name == "card_describe":
            return {"description": "## Goal\nShip it."}
        return {"criteria": ["Given a fresh clone, `docker compose up` serves the app on :8080"]}

    monkeypatch.setattr(providers, "complete_json", fake_json)

    r = client.post(f"/api/ai/cards/{card['id']}/assist", json={"action": "labels"}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json() == {"action": "labels", "label_ids": [real_label["id"]], "new_labels": [{"name": "infra", "color": "#ABCDEF"}]}
    assert calls[-1]["creds"] == Credentials(provider="openai", api_key="sk-proj-testkey12345", model="gpt-test")
    assert card["title"] in calls[-1]["user"] and "To do" in calls[-1]["user"]

    r = client.post(f"/api/ai/cards/{card['id']}/assist", json={"action": "subtasks", "instructions": "keep it to infra"}, headers=h)
    assert r.json()["subtasks"][0]["title"] == "Write Dockerfile" and "keep it to infra" in calls[-1]["user"]
    assert (
        client.post(f"/api/ai/cards/{card['id']}/assist", json={"action": "describe"}, headers=h)
        .json()["description"]
        .startswith("## Goal")
    )
    assert client.post(f"/api/ai/cards/{card['id']}/assist", json={"action": "acceptance_criteria"}, headers=h).json()["criteria"]
    assert client.post(f"/api/ai/cards/{card['id']}/assist", json={"action": "nope"}, headers=h).status_code == 422
    # the board was not modified by any of this
    after = client.get(f"/api/boards/{board['id']}", headers=h).json()
    assert after["columns"][0]["cards"][0]["labels"] == card["labels"] and len(after["labels"]) == len(board["labels"])
    # non-member cannot use AI on this card even with AI configured
    outsider = login(client, "peera")
    _configure(client, outsider)
    private = client.post("/api/boards", json={"title": "P"}, headers=h).json()
    assert client.post(f"/api/ai/boards/{private['id']}/summary", headers=outsider).status_code == 403


def test_malformed_model_output_is_502(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    h = login(client, "andrei")
    _configure(client, h)
    board = client.get("/api/boards", headers=h).json()[0]

    async def bad_json(*args: Any, **kwargs: Any) -> dict[str, Any]:
        return {"cards": [{"title": ""}]}  # fails validation (empty title, missing column_id)

    monkeypatch.setattr(providers, "complete_json", bad_json)
    r = client.post(f"/api/ai/boards/{board['id']}/draft-cards", json={"text": "notes"}, headers=h)
    assert r.status_code == 502 and "unexpected shape" in r.json()["detail"]

    async def boom(*args: Any, **kwargs: Any) -> str:
        raise AIProviderError("Authentication (401): invalid x-api-key", 401)

    monkeypatch.setattr(providers, "complete_text", boom)
    r = client.post("/api/ai/test", headers=h)
    assert r.status_code == 502 and "invalid x-api-key" in r.json()["detail"]


def test_summary_draft_and_chat(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    h = login(client, "gergo")
    _configure(client, h)
    board = client.get(f"/api/boards/{client.get('/api/boards', headers=h).json()[0]['id']}", headers=h).json()
    bid = board["id"]
    first_col, second_col = board["columns"][0]["id"], board["columns"][1]["id"]
    member = board["members"][0]["id"]
    captured: dict[str, Any] = {}

    async def fake_text(creds: Credentials, system: str, messages: list[dict[str, str]], max_tokens: int = 0) -> str:
        captured["system"] = system
        captured["messages"] = messages
        return "## Progress\nAll good."

    async def fake_json(
        creds: Credentials, system: str, user: str, schema: dict[str, Any], name: str, max_tokens: int = 0
    ) -> dict[str, Any]:
        captured["draft_prompt"] = user
        return {
            "cards": [
                {
                    "title": "Valid",
                    "description": "d",
                    "column_id": second_col,
                    "label_ids": [board["labels"][0]["id"], 4242],
                    "assignee_ids": [member, 4242],
                    "due_date": "2026-11-01",
                },
                {"title": "Bad column falls back", "column_id": 4242},
            ]
        }

    monkeypatch.setattr(providers, "complete_text", fake_text)
    monkeypatch.setattr(providers, "complete_json", fake_json)

    r = client.post(f"/api/ai/boards/{bid}/summary", headers=h)
    assert r.json() == {"summary": "## Progress\nAll good."}
    assert "OVERDUE" in captured["messages"][0]["content"]  # the seeded Done card is past due -> context flags it

    r = client.post(f"/api/ai/boards/{bid}/draft-cards", json={"text": "Meeting notes: build docker", "column_id": first_col}, headers=h)
    assert r.status_code == 200, r.text
    cards = r.json()["cards"]
    assert cards[0] == {
        "title": "Valid",
        "description": "d",
        "column_id": second_col,
        "label_ids": [board["labels"][0]["id"]],
        "assignee_ids": [member],
        "due_date": "2026-11-01",
    }
    assert cards[1]["column_id"] == first_col and cards[1]["due_date"] is None
    assert "build docker" in captured["draft_prompt"]
    assert client.post(f"/api/ai/boards/{bid}/draft-cards", json={"text": "x", "column_id": 4242}, headers=h).status_code == 400

    r = client.post(f"/api/ai/boards/{bid}/chat", json={"messages": [{"role": "user", "content": "who works on docker?"}]}, headers=h)
    assert r.json()["reply"].startswith("## Progress") and "Gergo" in captured["system"] and board["title"] in captured["system"]
    assert (
        client.post(f"/api/ai/boards/{bid}/chat", json={"messages": [{"role": "assistant", "content": "hi"}]}, headers=h).status_code == 422
    )
