"""Fill a freshly seeded TeamBoard instance with realistic demo data for the promo captures.

Usage: python seed_demo.py [http://localhost:8080]
Run once against an empty database that was started with SEED_ON_STARTUP=true (12 users + demo board).
Only uses the public REST API, so it works against any TeamBoard build.
"""
import json
import sys
import urllib.request
from datetime import date, timedelta

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080").rstrip("/")
TODAY = date.today()


def call(method, path, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req) as resp:
        raw = resp.read()
        return json.loads(raw) if raw else None


def login(local):
    return call("POST", "/api/auth/login", body={"email": f"{local}@teamboard.local", "password": "changeme"})["access_token"]


def d(days):
    return (TODAY + timedelta(days=days)).isoformat()


admin = login("daniel")
users = {u["email"].split("@")[0]: u["id"] for u in call("GET", "/api/users", admin)}
boards = call("GET", "/api/boards", admin)
main_id = next(b["id"] for b in boards if b["title"].startswith("Lucrum"))
board = call("GET", f"/api/boards/{main_id}", admin)
if sum(len(c["cards"]) for c in board["columns"]) > 7:
    print("demo data already present")
    sys.exit(0)

labels = {l["name"]: l["id"] for l in board["labels"]}
for name, color in [("strategy", "#722ed1"), ("infra", "#13c2c2")]:
    labels[name] = call("POST", f"/api/boards/{main_id}/labels", admin, {"name": name, "color": color})["id"]
cols = {c["title"]: c["id"] for c in board["columns"]}
cards = {c["title"]: c["id"] for col in board["columns"] for c in col["cards"]}


def card(col, title, lab, assignees, days, reviewers=(), description=""):
    body = {
        "title": title,
        "description": description,
        "due_date": d(days) if days is not None else None,
        "label_ids": [labels[x] for x in lab],
        "assignee_ids": [users[x] for x in assignees],
        "reviewer_ids": [users[x] for x in reviewers],
    }
    cards[title] = call("POST", f"/api/columns/{cols[col]}/cards", admin, body)["id"]


card("To do", "Equity curve chart on results page", ["frontend"], ["peera"], 9)
card("To do", "Docker sandbox for strategy runs", ["infra", "backend"], ["vladimir", "botond"], 12)
card("In progress", "Market data importer (CSV + Yahoo)", ["backend"], ["izzet"], 4, ["miki"])
card("In progress", "Strategy upload API", ["backend", "strategy"], ["botond", "ramtin"], 6)
card("Review", "Sharpe ratio & drawdown metrics", ["strategy"], ["miki"], 0, ["andrei", "daniel"])
card("Review", "Fix timezone bug in candle data", ["bug", "backend"], ["gergo"], -1, ["izzet"])
card("Done", "Dashboard wireframes", ["frontend"], ["peera", "andrada"], -3)
card("Done", "Sprint 2 retrospective notes", ["docs"], ["andrada"], -6)

# The card we open in the "card details" scene.
detail = cards["Backtest configuration form"]
call(
    "PATCH",
    f"/api/cards/{detail}",
    admin,
    {
        "description": "Form where a trader picks a strategy, the instruments, a date range and the starting capital, "
        "then launches a backtest.\n\n- Validate the date range against the data catalogue\n- Remember the last used settings\n"
        "- Show an estimate of the run time before starting",
        "due_date": d(5),
        "assignee_ids": [users["andrada"], users["gergo"]],
        "reviewer_ids": [users["miki"]],
        "label_ids": [labels["frontend"], labels["strategy"]],
    },
)
for who, text in [
    ("andrada", "First version is up on the branch. Date range picker still uses local time."),
    ("miki", "Looks good! Can we default the capital to 10 000 EUR like the client asked?"),
    ("gergo", "Done, and I added validation for empty instrument lists."),
]:
    call("POST", f"/api/cards/{detail}/comments", login(who), {"body": text})
call("POST", f"/api/cards/{cards['Sharpe ratio & drawdown metrics']}/comments", login("andrei"), {"body": "Reviewing today."})
call("POST", f"/api/cards/{cards['Login page + auth context']}/comments", login("daniel"), {"body": "Ready for review after lunch."})

# A few more boards for the boards grid.
everyone = list(users.values())
extra = [
    ("Sprint 3: data catalogue", "Instruments, data sources and the catalogue API.", ["daniel", "izzet", "andrei", "ramtin", "vladimir", "botond"]),
    ("SEP deliverables", "URD, SRD, ADD and the test plan, with deadlines.", list(users)),
    ("Client feedback", "Requests and questions from the Trading Association.", ["daniel", "miki", "lorik", "konstantin", "andrada"]),
    ("Team ops & meetings", "Agendas, minutes and who is presenting next.", list(users)),
    ("UI polish backlog", "Small visual fixes collected during demos.", ["daniel", "peera", "andrada", "gergo"]),
]
for title, desc, members in extra:
    b = call("POST", "/api/boards", admin, {"title": title, "description": desc})
    call("PUT", f"/api/boards/{b['id']}/members", admin, {"user_ids": [users[m] for m in members]})
    c = b["columns"]
    for i, t in enumerate(["Kick-off", "Collect requirements", "Draft"][: 1 + (b["id"] % 3)]):
        call("POST", f"/api/columns/{c[i % len(c)]['id']}/cards", admin, {"title": t})

# Invites so the Team page has content.
try:
    call("POST", "/api/invites", admin, {"email": "new.member@student.tue.nl", "name": "New Member", "board_id": main_id})
    call("POST", "/api/invites", admin, {"expires_in_days": 3, "max_uses": 5})
except Exception as exc:  # older builds without invites
    print("invites skipped:", exc)
print("demo data created; main board", main_id)
