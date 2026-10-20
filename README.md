# TeamBoard

A Trello-style kanban dashboard for a 12-person team, with live updates between users.

- **Backend:** FastAPI · Tortoise ORM · Aerich migrations · PostgreSQL · JWT auth · WebSocket hub
- **Frontend:** React 18 · TypeScript · Vite · Ant Design 5 · TanStack Query · @hello-pangea/dnd
- **Infra:** Docker Compose (Postgres + API + nginx-served SPA), GitHub Actions CI

## Quick start (Docker)

```bash
cp .env.example .env            # set SECRET_KEY to something long and random
docker compose up --build
```

Open <http://localhost:8080>. On first start the backend applies the Aerich migrations and seeds
12 accounts plus a demo board.

| Login                                    | Password   |
|------------------------------------------|------------|
| `daniel@teamboard.local` (admin)         | `changeme` |
| `miki@`, `izzet@`, `ramtin@`, `andrei@`, `andrada@`, `gergo@`, `peera@`, `botond@`, `vladimir@`, `lorik@`, `konstantin@` `…teamboard.local` | `changeme` |

Everyone should change their password from the avatar menu. Names/colours live in `backend/app/seed.py`;
the seed is idempotent (re-running never duplicates users, and the demo board is only created on an empty database).

## Local development

Backend (needs a Postgres, e.g. `docker compose up db`):

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env               # DATABASE_URL, SECRET_KEY
aerich upgrade                     # apply migrations
python -m app.seed                 # users + demo board
uvicorn app.main:app --reload      # http://localhost:8000/docs
```

Frontend:

```bash
cd frontend
npm install
npm run dev                        # http://localhost:5173, proxies /api (incl. websockets) to :8000
```

Tests and lint:

```bash
cd backend
pytest -q                                                   # in-memory SQLite, no services needed
TEST_DATABASE_URL=postgres://teamboard:teamboard@localhost:5432/teamboard_test pytest -q
ruff check app tests && ruff format --check app tests
```

## Changing the data model

1. Edit `backend/app/models/__init__.py`.
2. `aerich migrate --name describe_change` → new file in `backend/migrations/models/`.
3. `aerich upgrade`. Commit the migration file. CI fails if models and migrations drift.

## Features

- Boards with members (admins see every board; others only boards they belong to); owner/admin can delete.
- Columns: create, rename, drag to reorder, delete (cascades cards). New boards start with *To do / In progress / Review / Done*.
- Cards: drag between/within columns, title, description, due date (overdue/soon highlighting), multiple assignees and reviewers (board members only; reviewers shown with an eye icon), coloured labels, comments. The open card is in the URL (`?card=ID`) so it can be linked.
- Right-click context menus on cards, columns and the canvas. Dark mode.
- **Claude connector (MCP)**: the backend is an MCP server, so Claude can list/search boards, create, update and move
  cards, and comment — as you, with your permissions. claude.ai connects through OAuth (log in once on the consent page);
  Claude Code and scripts use a personal token from *avatar menu → Connect to Claude*. See `API.md` for the tool list.
- Filters: by assignee ("assigned to me"), by reviewer ("reviewed by me" / "no reviewer") and title search; drag-and-drop stays correct while filters hide cards.
- **Live updates:** every mutation is broadcast over a per-board WebSocket (`/api/ws/boards/{id}`) and a global
  board-list channel (`/api/ws/boards`); clients refetch on receipt. Protocol in [`API.md`](API.md).

## Deploying on Render (+ Supabase Postgres)

The root `Dockerfile` builds a single image: the API serves the built frontend from `/` and the API from `/api`, so
one Render web service is enough (no CORS, OAuth discovery at the origin root, WebSockets work).

1. **Database**: create a Supabase project, copy *Connect → Session pooler* URI (IPv4, port 5432) and append
   `?sslmode=require`. Don't use the transaction pooler (port 6543): asyncpg's prepared statements break on it.
   A Render Postgres works the same way (its internal URL, no `sslmode` needed).
2. **Service**: Render → New → Blueprint → this repo (`render.yaml`). Set `DATABASE_URL`; `SECRET_KEY` is generated,
   `PUBLIC_URL` defaults to the service's `onrender.com` URL. First deploy runs migrations and the seed.
3. Open the URL, log in, change passwords. Add the Claude connector with `https://<service>.onrender.com/api/mcp`.

Plan note: Render's **free** instance sleeps after 15 min idle and takes 30-60 s to wake. That breaks the claude.ai
OAuth handshake (10 s limit on discovery/token calls) and makes live updates lag after idle; the **starter** plan
(always-on) avoids both. Supabase free projects pause after a week without API/DB activity — the board's own traffic
keeps it alive as long as the team uses it.

## Frontend on Vercel (optional, keeps the UI responsive while a free-tier API wakes up)

The API can stay on Render while the SPA is served from Vercel. The page then loads instantly and shows a
"server is waking up" banner until the API answers.

- Vercel project: root directory `frontend`, framework Vite (`frontend/vercel.json` has the SPA rewrite and cache
  headers). Environment variable `VITE_API_URL=https://<render-service>.onrender.com` (build-time).
- Render service: add `FRONTEND_URL=https://<project>.vercel.app` (OAuth consent page lives there; CORS is derived).
  `PUBLIC_URL` stays the API origin - it is the MCP server URL for Claude.
- Without `VITE_API_URL` the build is the single-origin one used by the Docker image.

## Deploying on a shared VM (one public port, next to another project)

Run TeamBoard's compose bound to localhost and put one **host nginx** in front as the only public listener; it routes
to TeamBoard and to the other project (e.g. Lucrum) either by hostname or by path. Memory footprint of TeamBoard is
roughly 200 MB (Postgres + API + nginx).

```bash
git clone https://github.com/vargaking/teamboard && cd teamboard
cp .env.example .env
# in .env: SECRET_KEY=<openssl rand -hex 32>, POSTGRES_PASSWORD=<random>, WEB_BIND=127.0.0.1,
#          CORS_ORIGINS=["https://board.example.com"]   (the public origin users will type)
docker compose up -d --build
curl -s localhost:8080/api/health          # {"status":"ok",...}
```

Then install one of the host nginx configs and reload nginx:

- **By hostname** (`deploy/host-nginx-hostnames.conf`): `board.<domain>` → `127.0.0.1:8080`, `lucrum.<domain>` → the other
  app's local port. Needs a DNS record (or wildcard) per hostname. Simplest and most robust.
- **By path** (`deploy/host-nginx-paths.conf`): `/board/` → TeamBoard, `/` → the other app. Set `VITE_BASE=/board/` in `.env`
  **before** `docker compose up --build` so the frontend is built for that prefix.

Both configs forward WebSocket upgrades (required for live updates). For HTTPS, run `certbot --nginx` on the host; the
containers stay plain HTTP on localhost. Updating: `git pull && docker compose up -d --build` (migrations run on start).
Backups: `docker compose exec db pg_dump -U teamboard teamboard > backup.sql`.

## Connecting Claude

- **claude.ai**: Settings → Connectors → *Add custom connector* → paste `https://<your PUBLIC_URL>/api/mcp` → Connect →
  log in with your TeamBoard account on the consent page. Needs `PUBLIC_URL` set to the HTTPS address users reach the app at.
- **Claude Code**: create a personal token in *Connect to Claude*, then
  `claude mcp add --transport http teamboard https://<PUBLIC_URL>/api/mcp --header "Authorization: Bearer tb_pat_…"`.
- Tokens are stored hashed; OAuth access tokens last 1 h and are refreshed automatically (refresh tokens rotate, 30 days).
  Revoke personal tokens in the same dialog; revoke a claude.ai connection by removing the connector there.

## Architecture notes

- `API.md` is the contract between frontend and backend; keep it updated when you change an endpoint.
- Card and column ordering uses dense integer `position` values (0..n-1), renumbered server-side on every move/delete.
  Moves are done in one transaction, so concurrent drags never produce duplicate positions.
- The WebSocket hub (`backend/app/realtime.py`) is **in-process**. Run the API with a single uvicorn worker
  (the default). To scale to several workers/containers, replace `BoardHub` with a Redis pub/sub implementation
  with the same methods — nothing else needs to change.
- MCP: `backend/app/mcp/server.py` holds the tools, `oauth.py` the token/consent logic, `mount.py` the routing. The MCP SDK provides the OAuth endpoints and PKCE; we provide storage and the consent handoff to the SPA.
- Auth is a stateless HS256 JWT (`SECRET_KEY`), one week lifetime; the WebSocket takes it as `?token=`.
- Non-public e-mails (`@teamboard.local`) are allowed on purpose; swap `Email` in `schemas.py` for `EmailStr`
  if you ever open registration to real addresses.

## Layout

```
backend/
  app/
    core/        config, JWT + bcrypt, auth dependency
    models/      Tortoise models (users, boards, columns, cards, labels, comments)
    routers/     auth, users, boards(+labels, columns), columns, cards(+comments), ws
    realtime.py  in-process WebSocket hub
    schemas.py   Pydantic request/response models
    services.py  board/card loading, access checks, position renumbering
    seed.py      idempotent seed (12 users + demo board)
  migrations/    Aerich migrations
  tests/         API + websocket tests (SQLite by default, Postgres via TEST_DATABASE_URL)
frontend/
  src/api/       axios client + typed endpoint wrappers
  src/hooks/     react-query hooks + websocket hooks
  src/pages/     Login, Boards, Board
  src/components/ kanban column/card, card modal, member/label modals
```
