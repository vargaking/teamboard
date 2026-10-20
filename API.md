# TeamBoard API contract

Base path: `/api`. All endpoints except `POST /api/auth/login` require `Authorization: Bearer <jwt>`.
Errors: FastAPI default `{"detail": "..."}` with 400/401/403/404/409/422.
All timestamps are ISO-8601 UTC strings. `due_date` is an ISO date (`YYYY-MM-DD`) or `null`.

## Types

```ts
type User = { id: number; email: string; name: string; initials: string; color: string; is_admin: boolean; created_at: string };
type Label = { id: number; board_id: number; name: string; color: string };
type Card = {
  id: number; column_id: number; title: string; description: string; position: number;
  due_date: string | null; assignees: User[]; reviewers: User[]; labels: Label[]; comment_count: number;
  created_by: number; created_at: string; updated_at: string;
};
type Column = { id: number; board_id: number; title: string; position: number; cards: Card[] }; // cards sorted by position
type BoardSummary = { id: number; title: string; description: string; owner_id: number; member_ids: number[]; created_at: string };
type BoardDetail = { id: number; title: string; description: string; owner_id: number; members: User[]; labels: Label[]; columns: Column[]; created_at: string }; // columns sorted by position
type Comment = { id: number; card_id: number; author: User; body: string; created_at: string };
type Token = { access_token: string; token_type: "bearer"; user: User };
```

## Auth / users
- `POST /api/auth/login` body `{email, password}` → `Token` (401 on bad credentials)
- `GET  /api/auth/me` → `User`
- `GET  /api/users` → `User[]` (all 12 team members)
- `POST /api/auth/change-password` body `{current_password, new_password}` → `User`

## Boards
- `GET    /api/boards` → `BoardSummary[]` (boards the caller is a member of; admins see all)
- `POST   /api/boards` body `{title, description?}` → `BoardDetail` (creator becomes owner + member; default columns "To do / In progress / Review / Done" are created)
- `GET    /api/boards/{id}` → `BoardDetail` (403 if not member and not admin)
- `PATCH  /api/boards/{id}` body `{title?, description?}` → `BoardDetail`
- `DELETE /api/boards/{id}` → 204 (owner or admin only)
- `PUT    /api/boards/{id}/members` body `{user_ids: number[]}` → `BoardDetail` (owner is always kept as member)
- `POST   /api/boards/{id}/labels` body `{name, color}` → `Label`
- `PATCH  /api/labels/{id}` body `{name?, color?}` → `Label`
- `DELETE /api/labels/{id}` → 204

## Columns
- `POST   /api/boards/{id}/columns` body `{title}` → `Column` (appended at the end)
- `PATCH  /api/columns/{id}` body `{title}` → `Column`
- `PUT    /api/boards/{id}/columns/order` body `{column_ids: number[]}` → `BoardDetail` (must contain exactly the board's column ids)
- `DELETE /api/columns/{id}` → 204 (deletes its cards too)

## Cards
- `POST   /api/columns/{id}/cards` body `{title, description?, due_date?, assignee_ids?, reviewer_ids?, label_ids?}` → `Card` (appended at the end of the column; assignees and reviewers must be board members)
- `PATCH  /api/cards/{id}` body `{title?, description?, due_date?, assignee_ids?, reviewer_ids?, label_ids?}` → `Card` (send `due_date: null` to clear; `assignee_ids`/`reviewer_ids`/`label_ids` replace the full set)
- `POST   /api/cards/{id}/move` body `{column_id, position}` → `BoardDetail` (`position` = target index within the destination column, 0-based; positions of all affected cards are renumbered)
- `DELETE /api/cards/{id}` → 204
- `GET    /api/cards/{id}/comments` → `Comment[]` (oldest first)
- `POST   /api/cards/{id}/comments` body `{body}` → `Comment`
- `DELETE /api/comments/{id}` → 204 (author or admin)

## Seeded accounts
12 users, all with password `changeme`. Emails are `<firstname>@teamboard.local` (lowercase, ASCII): `daniel@teamboard.local` (admin), `miki@`, `izzet@`, `ramtin@`, `andrei@`, `andrada@`, `gergo@`, `peera@`, `botond@`, `vladimir@`, `lorik@`, `konstantin@`.

## Live updates (WebSocket)
- Board channel: `ws(s)://<host>/api/ws/boards/{board_id}?token=<jwt>`. Close codes: 4401 bad token, 4403 not a member, 4404 board missing.
- Global channel: `ws(s)://<host>/api/ws/boards?token=<jwt>` — board-list events.
- Server → client (JSON):
  - board channel: `{"type":"board.updated","board_id":N,"event":"card.moved"|"card.created"|"card.updated"|"card.deleted"|"column.created"|"column.updated"|"column.reordered"|"column.deleted"|"label.changed"|"board.updated"|"members.updated"|"comment.created"|"comment.deleted","actor_id":N,"entity_id":N|null}`
  - both channels: `{"type":"board.deleted","board_id":N}`
  - global channel: `{"type":"boards.changed","board_id":N,"event":string,"actor_id":N}`
- Client → server: text `ping` every 25 s; server replies `pong`.
- Clients treat every event as an invalidation hint and refetch the board; the server never pushes board state itself.
- The hub is in-process (single uvicorn worker). Scaling to several workers needs a Redis pub/sub backend — see README.
