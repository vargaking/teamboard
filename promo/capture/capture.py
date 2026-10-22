"""Capture the real TeamBoard UI for the promo video.

Starts a private TeamBoard instance (SQLite, fresh database, its own port), fills it with demo data, drives it with
Playwright and writes one H.264 clip per scene to promo/public/clips/, plus clips.json with frame counts and event
markers (e.g. the frame a card is dropped) that the Remotion composition uses to time zooms and callouts.

  python3 capture/capture.py                 # everything
  python3 capture/capture.py --only drag     # re-capture some clips (state carries over between clips, so the
                                             # default order is the safe choice)
  python3 capture/capture.py --no-build      # reuse .work/dist

Needs: the backend venv (backend/.venv), frontend node_modules, python `playwright` with Chromium under
/opt/pw-browsers (or PLAYWRIGHT_BROWSERS_PATH), ffmpeg (system or Remotion's bundled one).
"""

from __future__ import annotations

import argparse
import json
import re
import os
import shutil
import subprocess
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

from recorder import CURSOR_JS, Rec

HERE = os.path.dirname(os.path.abspath(__file__))
PROMO = os.path.dirname(HERE)
REPO = os.path.dirname(PROMO)
WORK = os.environ.get("PROMO_WORK", os.path.join(PROMO, ".work"))
CLIPS = os.path.join(PROMO, "public", "clips")
PORT = int(os.environ.get("PROMO_PORT", "47613"))
BASE = f"http://127.0.0.1:{PORT}"
BACKEND_PY = os.path.join(REPO, "backend", ".venv", "bin", "python")

# What the "Connect to Claude" dialog shows. The production API (Render) is the MCP server.
PROD_MCP_INFO = {
    "mcp_url": "https://teamboard-20i1.onrender.com/api/mcp",
    "oauth_enabled": True,
    "public_url": "https://teamboard-20i1.onrender.com",
}

# Main viewport: 1440x810 CSS px rendered at 2560x1440 so zooms in the edit stay sharp.
VIEW = {"width": 1440, "height": 810}
DPR = 2560 / 1440
# Side-by-side "live updates" panes.
LIVE_VIEW = {"width": 1180, "height": 820}
LIVE_DPR = 1.6
# Review counts clip (sidebar open)
REVIEW_VIEW = {"width": 1600, "height": 900}


# ---------------------------------------------------------------------------------------------------------------------
# infrastructure


def ffmpeg_bin() -> str:
    found = shutil.which("ffmpeg")
    if found:
        return found
    bundled = os.path.join(PROMO, "node_modules", "@remotion", "compositor-linux-x64-gnu", "ffmpeg")
    if os.path.exists(bundled):
        return bundled
    sys.exit("ffmpeg not found")


def build_frontend():
    dist = os.path.join(WORK, "dist")
    subprocess.run(
        ["npx", "vite", "build", "--outDir", dist, "--emptyOutDir"],
        cwd=os.path.join(REPO, "frontend"),
        check=True,
    )
    return dist


def start_backend(dist: str):
    db = os.path.join(WORK, "promo.db")
    for suffix in ("", "-wal", "-shm"):
        if os.path.exists(db + suffix):
            os.remove(db + suffix)
    env = dict(
        os.environ,
        DATABASE_URL=f"sqlite://{db}",
        AUTO_GENERATE_SCHEMAS="true",
        SEED_ON_STARTUP="true",
        SECRET_KEY="promo-secret-key-1234567890",
        PUBLIC_URL=BASE,
        # Invite links are built from FRONTEND_URL: show the team's real address in the Team page capture.
        FRONTEND_URL=os.environ.get("PROMO_FRONTEND_URL", "https://teamboard-sep.vercel.app"),
        STATIC_DIR=dist,
    )
    log = open(os.path.join(WORK, "backend.log"), "w")
    proc = subprocess.Popen(
        [BACKEND_PY, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(PORT)],
        cwd=os.path.join(REPO, "backend"),
        env=env,
        stdout=log,
        stderr=subprocess.STDOUT,
    )
    for _ in range(60):
        try:
            urllib.request.urlopen(BASE + "/api/health", timeout=1)
            return proc
        except Exception:
            time.sleep(0.5)
    proc.kill()
    sys.exit("backend did not start, see .work/backend.log")


def login_token(local: str) -> str:
    req = urllib.request.Request(
        BASE + "/api/auth/login",
        data=json.dumps({"email": f"{local}@teamboard.local", "password": "changeme"}).encode(),
        headers={"Content-Type": "application/json"},
    )
    return json.loads(urllib.request.urlopen(req).read())["access_token"]


def make_context(browser, user: str | None, theme: str = "light", view=VIEW, dpr=DPR, review_panel: str = "collapsed"):
    ctx = browser.new_context(viewport=view, device_scale_factor=dpr, locale="en-GB", timezone_id="Europe/Amsterdam")
    # The Review counts sidebar (board page) opens by default on wide screens; only its own clip shows it.
    init = f"localStorage.setItem('teamboard_theme', {json.dumps(theme)});"
    init += f"localStorage.setItem('teamboard_review_panel', {json.dumps(review_panel)});"
    if user:
        init += f"localStorage.setItem('teamboard_token', {json.dumps(login_token(user))});"
    # only on first load of the context, so later theme toggles are not reverted by navigations
    ctx.add_init_script("if (!sessionStorage.getItem('__promo_init')) { sessionStorage.setItem('__promo_init','1'); " + init + " }")
    ctx.add_init_script(CURSOR_JS)
    ctx.route("**/api/mcp-info", lambda route: route.fulfill(json=PROD_MCP_INFO))
    return ctx


def settle(page, ms=900):
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(ms)


def encode(name: str, frames_dir: str, out_name: str | None = None):
    os.makedirs(CLIPS, exist_ok=True)
    out = os.path.join(CLIPS, (out_name or name) + ".mp4")
    subprocess.run(
        [
            ffmpeg_bin(), "-y", "-loglevel", "error", "-framerate", "30", "-i", os.path.join(frames_dir, "%05d.jpg"),
            "-c:v", "libx264", "-preset", "slow", "-crf", "15", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out,
        ],
        check=True,
    )
    return out


class Session:
    """Holds clip metadata (frames + markers) and writes clips.json."""

    def __init__(self):
        path = os.path.join(CLIPS, "clips.json")
        self.meta = json.load(open(path)) if os.path.exists(path) else {}

    def finish(self, name: str, rec: Rec, markers: dict, files: dict | None = None, boxes: dict | None = None,
               view: dict | None = None):
        files = files or {name: name}
        for page_name, out_name in files.items():
            encode(out_name, os.path.join(rec.outdir, page_name))
        self.meta[name] = {
            "frames": rec.count,
            "markers": markers,
            "boxes": boxes or {},  # [x, y, w, h] in CSS px of the capture viewport
            "view": view or VIEW,
            "files": list(files.values()),
        }
        with open(os.path.join(CLIPS, "clips.json"), "w") as fh:
            json.dump(self.meta, fh, indent=2)
        print(f"clip {name}: {rec.count} frames, markers {markers}")


def frames_dir(name):
    d = os.path.join(WORK, "frames", name)
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(d)
    return d


def box(locator, pad: float = 0):
    """Bounding box [x, y, w, h] (CSS px) of an element, for zoom targets in the edit."""
    b = locator.bounding_box()
    if b is None:
        return None
    return [round(b["x"] - pad, 1), round(b["y"] - pad, 1), round(b["width"] + 2 * pad, 1), round(b["height"] + 2 * pad, 1)]


def card(page, title):
    return page.locator(".card-tile", has_text=title).first


def column(page, title):
    return page.locator(".board-column", has=page.locator(".column-title", has_text=title)).first


# ---------------------------------------------------------------------------------------------------------------------
# clips


def clip_boards(browser, ses: Session):
    ctx = make_context(browser, "daniel")
    page = ctx.new_page()
    page.goto(BASE + "/")
    settle(page)
    rec = Rec({"main": page}, frames_dir("boards"))
    m = {}
    b = {"lucrumTile": box(page.locator(".board-tile", has_text="Lucrum Backtesting")),
         "grid": box(page.locator(".board-tile").first), "header": box(page.locator(".page-header").first)}
    rec.set_mouse("main", 1180, 640)
    rec.hold(0.6)
    rec.glide("main", *rec.center("main", page.locator(".board-tile", has_text="Sprint 3")), 0.9, arc=0.2)
    rec.hold(0.3)
    rec.glide("main", *rec.center("main", page.locator(".board-tile", has_text="SEP deliverables")), 0.7)
    rec.hold(0.2)
    rec.glide("main", *rec.center("main", page.locator(".board-tile", has_text="Lucrum Backtesting")), 0.7)
    rec.hold(0.5)
    m["click"] = rec.count
    rec.click("main")
    page.wait_for_selector(".card-tile")
    page.wait_for_timeout(300)
    b["boardHeader"] = box(page.locator(".board-column").first)
    b["sharpeCard"] = box(card(page, "Sharpe ratio"))
    b["backtestCard"] = box(card(page, "Backtest configuration form"))
    b["columns"] = box(page.locator(".board-column").first)
    rec.glide("main", 1250, 700, 0.8)
    rec.hold(1.6)
    ses.finish("boards", rec, m, {"main": "boards"}, b)
    ctx.close()


def clip_drag(browser, ses: Session):
    ctx = make_context(browser, "daniel")
    page = ctx.new_page()
    page.goto(BASE + "/boards/1")
    settle(page)
    rec = Rec({"main": page}, frames_dir("drag"))
    m = {}
    rec.set_mouse("main", 760, 700)
    rec.hold(0.5)
    src = card(page, "Login page + auth context")
    b0 = {"source": box(src), "sharpeCard": box(card(page, "Sharpe ratio"))}
    rec.glide("main", *rec.center("main", src, dx=-20), 0.9, arc=0.2)
    rec.hold(0.4)
    m["grab"] = rec.count
    review = column(page, "Review")
    last = review.locator(".card-tile").last.bounding_box()
    target = (last["x"] + last["width"] / 2, last["y"] + last["height"] + 45)
    rec.drag("main", *target, seconds=1.7, arc=0.12)
    m["drop"] = rec.count
    rec.hold(0.5)
    rec.glide("main", target[0] + 230, target[1] + 90, 0.7)
    rec.hold(1.4)
    b = {"moved": box(card(page, "Login page + auth context")), "review": box(review), **b0}
    ses.finish("drag", rec, m, {"main": "drag"}, b)
    ctx.close()


def clip_live(browser, ses: Session):
    ctx_d = make_context(browser, "daniel", view=LIVE_VIEW, dpr=LIVE_DPR)
    ctx_m = make_context(browser, "miki", view=LIVE_VIEW, dpr=LIVE_DPR)
    pd, pm = ctx_d.new_page(), ctx_m.new_page()
    pd.goto(BASE + "/boards/1")
    pm.goto(BASE + "/boards/1")
    settle(pd)
    settle(pm)
    rec = Rec({"daniel": pd, "miki": pm}, frames_dir("live"), frame_real=0.2)
    m = {}
    rec.set_mouse("miki", 900, 700)
    rec.hold(0.6)
    # Stay in the middle of the viewport: @hello-pangea/dnd auto-scrolls the board near the edges.
    src = card(pm, "Market data importer")
    rec.glide("miki", *rec.center("miki", src, dx=-30), 0.9, arc=0.2)
    rec.hold(0.3)
    m["grab"] = rec.count
    first = column(pm, "Review").locator(".card-tile").first.bounding_box()
    target = (first["x"] + first["width"] / 2, first["y"] + 25)
    rec.drag("miki", *target, seconds=1.6, arc=0.1)
    m["drop"] = rec.count
    # wait until Daniel's page shows the card in Done
    for _ in range(40):
        if column(pd, "Review").locator(".card-tile", has_text="Market data importer").count():
            break
        rec.frame()
    m["synced"] = rec.count
    rec.hold(0.4)
    rec.glide("miki", target[0] + 120, target[1] + 260, 0.6)
    rec.hold(2.2)
    b = {"liveDot": box(pd.locator(".live-indicator").first, 6),
         "syncedCard": box(column(pd, "Review").locator(".card-tile", has_text="Market data importer"))}
    ses.finish("live", rec, m, {"daniel": "live-daniel", "miki": "live-miki"}, b, LIVE_VIEW)
    ctx_d.close()
    ctx_m.close()


def clip_details(browser, ses: Session):
    ctx = make_context(browser, "daniel")
    page = ctx.new_page()
    page.goto(BASE + "/boards/1")
    settle(page)
    rec = Rec({"main": page}, frames_dir("details"))
    m = {}
    rec.set_mouse("main", 900, 700)
    rec.hold(0.4)
    tile = box(card(page, "Backtest configuration form"))
    rec.glide("main", *rec.center("main", card(page, "Backtest configuration form"), dx=-40), 0.8, arc=0.2)
    rec.hold(0.3)
    m["open"] = rec.count
    rec.click("main")
    page.wait_for_selector(".ant-modal-content")
    rec.hold(1.0)
    m["opened"] = rec.count
    modal = page.locator(".ant-modal-content")
    b = {"modal": box(modal), "people": box(modal.locator(".ant-select", has_text="Miki Petkovic").first),
         "assignees": box(modal.locator(".ant-select", has_text="Andrada Florea").first),
         "labels": box(modal.locator(".ant-select", has_text="frontend").first), "tile": tile}
    # glide over the people area, then to the comment box
    rec.glide("main", *rec.center("main", modal.locator(".ant-select", has_text="Miki Petkovic").first, dx=40), 0.9)
    m["reviewers"] = rec.count
    rec.hold(1.4)
    rec.glide("main", *rec.center("main", modal.get_by_text("Comments", exact=True).first, dx=200), 0.6)
    for _ in range(12):  # scroll the modal so the comment thread and the input are in view
        page.mouse.wheel(0, 40)
        rec.frame()
    rec.hold(0.4)
    b["comments"] = box(modal.get_by_text("Comments", exact=True).first)
    ta = modal.locator("textarea").last
    rec.glide("main", *rec.center("main", ta), 0.6)
    m["comment"] = rec.count
    rec.click("main")
    rec.type("main", "Reviewed: looks great, merging!", per_char_frames=1)
    rec.hold(0.3)
    send = modal.get_by_role("button", name="Comment", exact=True)
    rec.glide("main", *rec.center("main", send.first), 0.5)
    rec.click("main")
    m["sent"] = rec.count
    rec.hold(1.0)
    b["newComment"] = box(modal.get_by_text("Reviewed: looks great, merging!").last)
    b["modalAfter"] = box(modal)
    rec.hold(1.0)
    page.keyboard.press("Escape")
    rec.hold(0.6)
    ses.finish("details", rec, m, {"main": "details"}, b)
    ctx.close()


def pick_option(rec: Rec, page, select_label: str, option_text: str, m: dict, key: str):
    sel = page.get_by_label(select_label) if page.get_by_label(select_label).count() else None
    target = page.locator(".ant-select", has=page.locator(f"[aria-label='{select_label}']")).first
    rec.glide("main", *rec.center("main", target), 0.7)
    rec.click("main")
    page.wait_for_selector(".ant-select-dropdown:visible")
    rec.hold(0.5)
    opt = page.locator(".ant-select-dropdown:visible .ant-select-item-option", has_text=option_text).first
    rec.glide("main", *rec.center("main", opt), 0.5)
    rec.hold(0.15)
    m[key] = rec.count
    rec.click("main")
    rec.hold(0.4)
    del sel


def clip_filters(browser, ses: Session):
    ctx = make_context(browser, "daniel")
    page = ctx.new_page()
    page.goto(BASE + "/boards/1")
    settle(page)
    rec = Rec({"main": page}, frames_dir("filters"))
    m = {}
    rec.set_mouse("main", 700, 500)
    rec.hold(0.3)
    labels = page.locator(".ant-select [aria-label]").evaluate_all("els => els.map(e => e.getAttribute('aria-label'))")
    assignee_label = next(l for l in labels if "ssignee" in l)
    reviewer_label = next(l for l in labels if "eviewer" in l)
    b = {"filterBar": box(page.locator(".ant-select").first)}
    pick_option(rec, page, assignee_label, "Assigned to me", m, "assignee")
    rec.hold(1.0)
    pick_option(rec, page, assignee_label, "Any assignee", m, "assigneeReset")
    pick_option(rec, page, reviewer_label, "Reviewed by me", m, "reviewer")
    rec.hold(1.0)
    pick_option(rec, page, reviewer_label, "Any reviewer", m, "reviewerReset")
    search = page.get_by_placeholder("Search cards")
    rec.glide("main", *rec.center("main", search), 0.6)
    rec.click("main")
    m["search"] = rec.count
    rec.type("main", "data", per_char_frames=3)
    rec.hold(1.3)
    page.keyboard.press("Control+A")
    page.keyboard.press("Backspace")
    rec.hold(0.4)
    b["search"] = box(search)
    ses.finish("filters", rec, m, {"main": "filters"}, b)
    ctx.close()


def clip_context(browser, ses: Session):
    ctx = make_context(browser, "daniel")
    page = ctx.new_page()
    page.goto(BASE + "/boards/1")
    settle(page)
    rec = Rec({"main": page}, frames_dir("context"))
    m = {}
    rec.set_mouse("main", 800, 650)
    rec.hold(0.2)
    rec.glide("main", *rec.center("main", card(page, "Market data importer"), dx=20), 0.7)
    m["cardMenu"] = rec.count
    rec.click("main", button="right")
    page.wait_for_selector(".ant-dropdown:visible")
    rec.hold(0.5)
    b = {"cardMenu": box(page.locator(".ant-dropdown:visible").first)}
    move = page.locator(".ant-dropdown:visible .ant-dropdown-menu-submenu-title", has_text="Move to").first
    rec.glide("main", *rec.center("main", move), 0.5)
    rec.hold(1.2)
    page.keyboard.press("Escape")
    page.mouse.click(1300, 780)
    rec.hold(0.4)
    header = column(page, "Done").locator(".column-header")
    rec.glide("main", *rec.center("main", header, dx=-40), 0.7)
    m["columnMenu"] = rec.count
    rec.click("main", button="right")
    rec.hold(0.3)
    b["columnMenu"] = box(page.locator(".ant-dropdown:visible").last)
    rec.hold(1.3)
    page.keyboard.press("Escape")
    rec.hold(0.3)
    ses.finish("context", rec, m, {"main": "context"}, b)
    ctx.close()


def clip_dark(browser, ses: Session):
    ctx = make_context(browser, "daniel")
    page = ctx.new_page()
    page.goto(BASE + "/boards/1")
    settle(page)
    rec = Rec({"main": page}, frames_dir("dark"))
    m = {}
    rec.set_mouse("main", 1100, 400)
    rec.hold(0.2)
    rec.glide("main", *rec.center("main", page.locator(".theme-toggle")), 0.8)
    rec.hold(0.2)
    m["toggle"] = rec.count
    b = {"toggle": box(page.locator(".theme-toggle"), 4)}
    rec.click("main")
    rec.glide("main", 1000, 520, 1.0)
    rec.hold(1.8)
    ses.finish("dark", rec, m, {"main": "dark"}, b)
    ctx.close()


def clip_claude(browser, ses: Session):
    ctx = make_context(browser, "daniel")
    page = ctx.new_page()
    page.goto(BASE + "/boards/1")
    settle(page)
    rec = Rec({"main": page}, frames_dir("claude"))
    m = {}
    rec.set_mouse("main", 1000, 400)
    rec.hold(0.3)
    rec.glide("main", *rec.center("main", page.locator(".avatar-button")), 0.8)
    rec.click("main")
    page.wait_for_selector(".ant-dropdown:visible")
    rec.hold(0.4)
    item = page.locator(".ant-dropdown:visible .ant-dropdown-menu-item", has_text=re.compile("Connect (to Claude|an AI assistant)")).first
    b = {"menu": box(page.locator(".ant-dropdown:visible").first)}
    rec.glide("main", *rec.center("main", item), 0.5)
    m["menu"] = rec.count
    rec.hold(0.3)
    rec.click("main")
    page.wait_for_selector(".ant-modal-content")
    page.wait_for_timeout(200)
    m["dialog"] = rec.count
    rec.hold(1.0)
    b["dialog"] = box(page.locator(".ant-modal-content"))
    b["steps"] = box(page.locator(".ant-modal-content .connect-steps"))
    rec.glide("main", *rec.center("main", page.locator(".ant-modal-content .connect-steps")), 0.8)
    rec.hold(2.2)
    tab = page.locator(".ant-modal-content .ant-tabs-tab", has_text="ChatGPT").first
    if tab.count():  # builds with the "Connect an AI assistant" dialog
        rec.glide("main", *rec.center("main", tab), 0.6)
        m["chatgptTab"] = rec.count
        rec.click("main")
        rec.hold(0.3)
        b["chatgptSteps"] = box(page.locator(".ant-modal-content .ant-tabs-tabpane-active").first)
        rec.hold(2.4)
    else:
        tab = page.locator(".ant-modal-content .ant-tabs-tab", has_text="Claude Code").first
        rec.glide("main", *rec.center("main", tab), 0.6)
        m["codeTab"] = rec.count
        rec.click("main")
        rec.hold(2.0)
    page.keyboard.press("Escape")
    rec.hold(0.6)
    rec.glide("main", 1250, 720, 0.6)
    rec.hold(0.6)
    m["create"] = rec.count
    out = subprocess.run(
        [BACKEND_PY, os.path.join(HERE, "claude_create_card.py"), BASE, "Created by Claude", "To do"],
        check=True, capture_output=True, text=True,
    )
    print("  mcp:", out.stdout.strip())
    for _ in range(40):
        if card(page, "Created by Claude").count():
            break
        rec.frame()
    m["appeared"] = rec.count
    rec.hold(0.6)
    b["newCard"] = box(card(page, "Created by Claude"))
    b["todo"] = box(column(page, "To do"))
    rec.glide("main", *rec.center("main", card(page, "Created by Claude"), dx=60), 0.8)
    rec.hold(2.2)
    ses.finish("claude", rec, m, {"main": "claude"}, b)
    ctx.close()


def make_trello_export(path: str):
    members = [
        {"id": "m1", "fullName": "Miki Petkovic", "username": "mikip"},
        {"id": "m2", "fullName": "Izzet Pensoy", "username": "izzetp"},
        {"id": "m3", "fullName": "Andrada Florea", "username": "andradaf"},
        {"id": "m4", "fullName": "Peera Wiwattanakantang", "username": "peeraw"},
    ]
    lists = [("l1", "Ideas"), ("l2", "Reading"), ("l3", "Summarised")]
    labels = [{"id": "lb1", "name": "research", "color": "purple"}, {"id": "lb2", "name": "client", "color": "orange"},
              {"id": "lb3", "name": "", "color": "sky"}]
    cards = [
        ("c1", "l1", "Mean-reversion strategy for FX pairs", ["m1"], ["lb1"]),
        ("c2", "l1", "Ask TA which brokers they use", ["m3"], ["lb2"]),
        ("c3", "l1", "Compare backtesting libraries", ["m2"], ["lb1"]),
        ("c4", "l2", "Paper: walk-forward optimisation", ["m1", "m2"], ["lb1"]),
        ("c5", "l2", "Order book data sources", ["m4"], ["lb3"]),
        ("c6", "l3", "Slippage models overview", ["m2"], ["lb1"]),
        ("c7", "l3", "Interview notes: TA board", ["m3"], ["lb2"]),
    ]
    export = {
        "id": "b1", "name": "Lucrum research (Trello)", "desc": "Old research board from Trello.",
        "members": members,
        "labels": labels,
        "lists": [{"id": i, "name": n, "closed": False, "pos": k * 1000} for k, (i, n) in enumerate(lists)],
        "cards": [
            {"id": cid, "idList": lid, "name": name, "desc": "", "closed": False, "pos": k * 100,
             "due": "2026-11-0%dT12:00:00.000Z" % (1 + k % 8), "idMembers": mem, "idLabels": lab, "attachments": []}
            for k, (cid, lid, name, mem, lab) in enumerate(cards)
        ],
        "checklists": [{"id": "ch1", "idCard": "c3", "name": "Candidates", "pos": 1,
                        "checkItems": [{"name": "backtrader", "state": "complete", "pos": 1},
                                       {"name": "vectorbt", "state": "incomplete", "pos": 2}]}],
        "actions": [
            {"type": "commentCard", "date": "2026-09-30T10:00:00.000Z", "memberCreator": members[0],
             "data": {"card": {"id": "c4"}, "text": "Worth presenting at the next meeting."}},
            {"type": "commentCard", "date": "2026-10-01T10:00:00.000Z", "memberCreator": members[2],
             "data": {"card": {"id": "c7"}, "text": "Uploaded the notes to the drive."}},
        ],
    }
    with open(path, "w") as fh:
        json.dump(export, fh, indent=1)


def clip_trello(browser, ses: Session):
    export_path = os.path.join(WORK, "lucrum-research-trello.json")
    make_trello_export(export_path)
    ctx = make_context(browser, "daniel")
    page = ctx.new_page()
    page.goto(BASE + "/")
    settle(page)
    rec = Rec({"main": page}, frames_dir("trello"))
    m = {}
    rec.set_mouse("main", 900, 600)
    rec.hold(0.3)
    rec.glide("main", *rec.center("main", page.get_by_role("button", name="Import from Trello")), 0.8)
    m["button"] = rec.count
    rec.click("main")
    page.wait_for_selector(".ant-modal-content .ant-upload")
    rec.hold(0.8)
    rec.glide("main", *rec.center("main", page.locator(".ant-modal-content .ant-upload-drag")), 0.7)
    m["upload"] = rec.count
    rec.hold(0.3)
    page.locator(".ant-modal-content input[type=file]").set_input_files(export_path)
    for _ in range(30):
        if page.locator(".ant-modal-content").get_by_text("Miki Petkovic").count():
            break
        rec.frame()
    m["preview"] = rec.count
    rec.hold(0.6)
    b = {"modal": box(page.locator(".ant-modal-content"))}
    rec.glide("main", *rec.center("main", page.locator(".ant-modal-content").get_by_text("Miki Petkovic").first), 0.8)
    rec.hold(1.8)
    btn = page.locator(".ant-modal-footer button.ant-btn-primary").last
    for _ in range(14):  # scroll the dialog down to its footer
        page.mouse.wheel(0, 45)
        rec.frame()
    rec.hold(0.3)
    rec.glide("main", *rec.center("main", btn), 0.7)
    m["import"] = rec.count
    rec.click("main")
    for _ in range(45):
        if page.locator(".ant-modal-content").count() == 0 or "/boards/" in page.url:
            break
        rec.frame()
    page.wait_for_timeout(200)
    m["imported"] = rec.count
    rec.glide("main", 1250, 700, 0.6)
    rec.hold(0.6)
    b["after"] = box(page.locator(".board-column").first) if page.locator(".board-column").count() else None
    rec.hold(1.2)
    ses.finish("trello", rec, m, {"main": "trello"}, b)
    ctx.close()


def clip_team(browser, ses: Session):
    ctx = make_context(browser, "daniel")
    page = ctx.new_page()
    page.goto(BASE + "/team")
    settle(page, 1200)
    rec = Rec({"main": page}, frames_dir("team"))
    m = {}
    b = {"table": box(page.locator(".ant-table").first)}
    rec.set_mouse("main", 700, 500)
    rec.hold(0.6)
    rec.glide("main", 760, 420, 0.8)
    add = page.get_by_role("button", name="Add user")
    if add.count():
        rec.glide("main", *rec.center("main", add.first), 0.7)
        rec.hold(0.4)
    inv = page.locator("button", has_text="invite").first
    rec.glide("main", *rec.center("main", inv), 0.6)
    m["invite"] = rec.count
    rec.click("main")
    page.wait_for_selector(".ant-modal-content")
    rec.hold(0.8)
    email = page.locator(".ant-modal-content input").first
    rec.glide("main", *rec.center("main", email), 0.6)
    rec.click("main")
    page.keyboard.insert_text("konstantin.s@student.tue.nl")  # at once: the form validates while typing
    rec.frame(8)
    rec.hold(0.3)
    create = page.locator(".ant-modal-footer button.ant-btn-primary").last
    rec.glide("main", *rec.center("main", create), 0.7)
    m["create"] = rec.count
    rec.click("main")
    rec.hold(0.6)
    b["inviteModal"] = box(page.locator(".ant-modal-content").last)
    rec.hold(2.0)
    m["link"] = rec.count
    ses.finish("team", rec, m, {"main": "team"}, b)
    ctx.close()


def clip_login(browser, ses: Session):
    ctx = make_context(browser, None)
    page = ctx.new_page()
    page.goto(BASE + "/login")
    settle(page)
    rec = Rec({"main": page}, frames_dir("login"))
    m = {}
    b = {"form": box(page.locator("form").first)}
    rec.set_mouse("main", 1000, 650)
    rec.hold(0.4)
    inputs = page.locator("input")
    rec.glide("main", *rec.center("main", inputs.nth(0)), 0.7)
    rec.click("main")
    m["email"] = rec.count
    rec.type("main", "miki@teamboard.local", per_char_frames=1)
    rec.glide("main", *rec.center("main", inputs.nth(1)), 0.4)
    rec.click("main")
    rec.type("main", "changeme", per_char_frames=1)
    rec.hold(0.2)
    rec.glide("main", *rec.center("main", page.locator("button[type=submit]")), 0.5)
    m["login"] = rec.count
    rec.click("main")
    page.wait_for_selector(".board-tile")
    page.wait_for_timeout(200)
    rec.hold(0.6)
    rec.glide("main", *rec.center("main", page.locator(".avatar-button")), 0.8)
    rec.click("main")
    page.wait_for_selector(".ant-dropdown:visible")
    rec.hold(0.4)
    item = page.locator(".ant-dropdown:visible .ant-dropdown-menu-item", has_text="password").first
    rec.glide("main", *rec.center("main", item), 0.5)
    m["menu"] = rec.count
    rec.click("main")
    page.wait_for_selector(".ant-modal-content")
    rec.hold(0.5)
    m["modal"] = rec.count
    b["modal"] = box(page.locator(".ant-modal-content"))
    b["menu"] = None
    rec.glide("main", *rec.center("main", page.locator(".ant-modal-content input").first), 0.6)
    rec.hold(1.8)
    ses.finish("login", rec, m, {"main": "login"}, b)
    ctx.close()


def clip_reviews(browser, ses: Session):
    """Review counts sidebar: add a reviewer in the card dialog, finish a reviewed card, filter by a reviewer."""
    # A bit wider than the other clips: with the 260 px sidebar the four columns still fit without auto-scrolling.
    ctx = make_context(browser, "daniel", review_panel="open", view=REVIEW_VIEW, dpr=2560 / REVIEW_VIEW["width"])
    page = ctx.new_page()
    page.goto(BASE + "/boards/1")
    settle(page)
    rec = Rec({"main": page}, frames_dir("reviews"))
    m = {}
    panel = page.locator(".review-panel")
    row = lambda name: panel.locator(".review-row", has_text=name).first  # noqa: E731
    b = {"panel": box(panel), "rowDaniel": box(row("Dániel")), "footer": box(panel.locator(".review-panel-footer"))}
    rec.set_mouse("main", 900, 700)
    rec.hold(0.8)
    # 1. add Dániel as reviewer of "Strategy upload API" in the card dialog
    target = card(page, "Strategy upload API")
    rec.glide("main", *rec.center("main", target, dx=-30), 0.8, arc=0.2)
    m["open"] = rec.count
    rec.click("main")
    page.wait_for_selector(".ant-modal-content")
    rec.hold(0.5)
    sel = page.locator(".ant-modal-content .ant-select", has=page.locator("[aria-label='Reviewers']")).first
    rec.glide("main", *rec.center("main", sel), 0.6)
    rec.click("main")
    page.wait_for_selector(".ant-select-dropdown:visible")
    rec.hold(0.3)
    opt = page.locator(".ant-select-dropdown:visible .ant-select-item-option", has_text="Dániel").first
    rec.glide("main", *rec.center("main", opt), 0.5)
    m["pick"] = rec.count
    rec.click("main")
    rec.hold(0.6)
    page.keyboard.press("Escape")
    rec.hold(0.2)
    page.keyboard.press("Escape")
    page.wait_for_selector(".ant-modal-content", state="detached", timeout=5000)
    m["closed"] = rec.count
    rec.hold(1.0)
    b["rowDanielAfterAdd"] = box(row("Dániel"))
    # 2. drag a card Dániel reviews ("Sharpe ratio") from Review to Done: his count moves to "done" live
    src = card(page, "Sharpe ratio")
    rec.glide("main", *rec.center("main", src, dx=-30), 0.8, arc=0.2)
    m["grab"] = rec.count
    first = column(page, "Done").locator(".card-tile").first.bounding_box()
    rec.drag("main", first["x"] + 70, first["y"] + 25, seconds=1.4, arc=0.05)
    m["drop"] = rec.count
    rec.hold(1.4)
    b["moved"] = box(card(page, "Sharpe ratio"))
    # 3. click Dániel's row: the board filters to the cards he reviews
    rec.glide("main", *rec.center("main", row("Dániel")), 0.8)
    m["filter"] = rec.count
    rec.click("main")
    rec.hold(0.6)
    rec.glide("main", 1100, 640, 0.6)
    rec.hold(1.6)
    b["panelEnd"] = box(panel)
    ses.finish("reviews", rec, m, {"main": "reviews"}, b, REVIEW_VIEW)
    ctx.close()


def replay_earlier_state():
    """When later clips are captured on their own: apply what the earlier clips did to the board, via REST."""
    tok = login_token("daniel")

    def call(method, path, body=None):
        req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, method=method)
        req.add_header("Content-Type", "application/json")
        req.add_header("Authorization", f"Bearer {tok}")
        raw = urllib.request.urlopen(req).read()
        return json.loads(raw) if raw else None

    board = call("GET", "/api/boards/1")
    cols = {c["title"]: c for c in board["columns"]}
    cards = {c["title"]: c["id"] for col in board["columns"] for c in col["cards"]}
    call("POST", f"/api/cards/{cards['Login page + auth context']}/move", {"column_id": cols["Review"]["id"], "position": len(cols["Review"]["cards"])})
    call("POST", f"/api/cards/{cards['Market data importer (CSV + Yahoo)']}/move", {"column_id": cols["Review"]["id"], "position": 0})
    call("POST", f"/api/cards/{cards['Backtest configuration form']}/comments", {"body": "Reviewed: looks great, merging!"})


ORDER = ["boards", "drag", "live", "details", "reviews", "filters", "context", "claude", "dark", "trello", "team", "login"]
CLIP_FNS = {name: globals()[f"clip_{name}"] for name in ORDER}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", default=None)
    ap.add_argument("--no-build", action="store_true")
    ap.add_argument("--dist", help="use this already-built frontend dist/ instead of building ../frontend")
    args = ap.parse_args()
    os.makedirs(WORK, exist_ok=True)
    if args.dist:
        dist = os.path.abspath(args.dist)
    elif args.no_build and os.path.exists(os.path.join(WORK, "dist")):
        dist = os.path.join(WORK, "dist")
    else:
        dist = build_frontend()
    backend = start_backend(dist)
    try:
        subprocess.run([sys.executable, os.path.join(HERE, "seed_demo.py"), BASE], check=True)
        ses = Session()
        if args.only and "drag" not in args.only and any(c in args.only for c in ("details", "filters", "context", "claude", "dark")):
            replay_earlier_state()
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for name in ORDER:
                if args.only and name not in args.only:
                    continue
                print("capturing", name)
                CLIP_FNS[name](browser, ses)
            browser.close()
    finally:
        backend.terminate()
        backend.wait(10)


if __name__ == "__main__":
    main()
