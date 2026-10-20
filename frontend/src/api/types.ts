// Types mirroring /API.md exactly.

export type User = {
  id: number;
  email: string;
  name: string;
  initials: string;
  color: string;
  is_admin: boolean;
  created_at: string;
};

export type Label = {
  id: number;
  board_id: number;
  name: string;
  color: string;
};

export type Card = {
  id: number;
  column_id: number;
  title: string;
  description: string;
  position: number;
  due_date: string | null;
  assignees: User[];
  reviewers: User[];
  labels: Label[];
  comment_count: number;
  created_by: number;
  created_at: string;
  updated_at: string;
};

/** cards sorted by position */
export type Column = {
  id: number;
  board_id: number;
  title: string;
  position: number;
  cards: Card[];
};

export type BoardSummary = {
  id: number;
  title: string;
  description: string;
  owner_id: number;
  member_ids: number[];
  created_at: string;
};

/** columns sorted by position */
export type BoardDetail = {
  id: number;
  title: string;
  description: string;
  owner_id: number;
  members: User[];
  labels: Label[];
  columns: Column[];
  created_at: string;
};

export type Comment = {
  id: number;
  card_id: number;
  author: User;
  body: string;
  created_at: string;
};

export type Token = {
  access_token: string;
  token_type: 'bearer';
  user: User;
};

// ---- request bodies ----

export type LoginRequest = { email: string; password: string };
export type ChangePasswordRequest = { current_password: string; new_password: string };

export type BoardCreate = { title: string; description?: string };
export type BoardUpdate = { title?: string; description?: string };
export type BoardMembersUpdate = { user_ids: number[] };

export type LabelCreate = { name: string; color: string };
export type LabelUpdate = { name?: string; color?: string };

export type ColumnCreate = { title: string };
export type ColumnUpdate = { title: string };
export type ColumnOrder = { column_ids: number[] };

export type CardCreate = {
  title: string;
  description?: string;
  due_date?: string | null;
  assignee_ids?: number[];
  reviewer_ids?: number[];
  label_ids?: number[];
};
export type CardUpdate = {
  title?: string;
  description?: string;
  due_date?: string | null;
  assignee_ids?: number[];
  reviewer_ids?: number[];
  label_ids?: number[];
};
export type CardMove = { column_id: number; position: number };

export type CommentCreate = { body: string };

// ---- live updates (WebSocket) ----

export type BoardEventName =
  | 'card.moved'
  | 'card.created'
  | 'card.updated'
  | 'card.deleted'
  | 'column.created'
  | 'column.updated'
  | 'column.reordered'
  | 'column.deleted'
  | 'label.changed'
  | 'board.updated'
  | 'members.updated'
  | 'comment.created'
  | 'comment.deleted';

/** board channel: /api/ws/boards/{board_id} */
export type BoardUpdatedMessage = {
  type: 'board.updated';
  board_id: number;
  /** One of BoardEventName; typed as string so unknown future events still parse. */
  event: string;
  actor_id: number;
  entity_id: number | null;
};

/** both channels */
export type BoardDeletedMessage = {
  type: 'board.deleted';
  board_id: number;
};

/** global channel: /api/ws/boards */
export type BoardsChangedMessage = {
  type: 'boards.changed';
  board_id: number;
  event: string;
  actor_id: number;
};

export type BoardChannelMessage = BoardUpdatedMessage | BoardDeletedMessage;
export type BoardsChannelMessage = BoardsChangedMessage | BoardDeletedMessage;
export type LiveMessage = BoardUpdatedMessage | BoardDeletedMessage | BoardsChangedMessage;

// ---- MCP / Connect to Claude ----

export type McpInfo = { mcp_url: string; oauth_enabled: boolean; public_url: string };

export type PersonalToken = {
  id: number;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
};

/** Returned once by POST /api/tokens: `token` is never shown again. */
export type PersonalTokenCreated = PersonalToken & { token: string };

export type PersonalTokenCreate = { name: string };

// ---- OAuth consent (claude.ai connector) ----

export type OAuthConsentInfo = { client_name: string; scopes: string[]; redirect_host: string };
export type OAuthConsentDecision = { req: string; approve: boolean };
export type OAuthConsentResult = { redirect_to: string };

// ---- Import a Trello board ----

/** The raw Trello board export (Board menu → Print and export → Export as JSON). Opaque to the client. */
export type TrelloExport = Record<string, unknown>;

export type TrelloMemberMatch = {
  trello_id: string;
  trello_name: string;
  trello_username: string | null;
  card_count: number;
  suggested_user_id: number | null;
};

export type TrelloPreview = {
  title: string;
  description: string;
  lists: { name: string; archived: boolean; card_count: number }[];
  card_count: number;
  archived_card_count: number;
  label_count: number;
  comment_count: number;
  checklist_count: number;
  members: TrelloMemberMatch[];
};

export type TrelloImportOptions = {
  /** defaults to the Trello board name */
  title?: string;
  /** default false: archived lists and cards are skipped */
  include_archived?: boolean;
  /** trello member id -> user id (mapped users become board members + assignees) */
  member_map?: Record<string, number>;
};

export type TrelloPreviewRequest = { export: TrelloExport };
export type TrelloImportRequest = { export: TrelloExport; options?: TrelloImportOptions };

// ---- Team management & invites ----

export type UserCreate = { email: string; name: string; password: string; is_admin?: boolean };
export type UserUpdate = { name?: string; is_admin?: boolean; password?: string };

export type Invite = {
  id: number;
  email: string | null;
  name: string | null;
  board_id: number | null;
  board_title: string | null;
  created_by: User;
  created_at: string;
  expires_at: string;
  max_uses: number;
  uses: number;
  revoked: boolean;
  /** returned ONLY by POST /api/invites (the token is shown once) */
  url: string | null;
};

export type InviteCreate = {
  email?: string;
  name?: string;
  board_id?: number;
  /** 1..30, default 7 */
  expires_in_days?: number;
  /** 1..100, default 1 */
  max_uses?: number;
};

export type InviteInfo = {
  valid: boolean;
  reason: string | null;
  email: string | null;
  name: string | null;
  board_title: string | null;
  invited_by: string;
};

export type InviteAccept = { name: string; email: string; password: string };
