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

// ---- AI (bring-your-own key) ----

export type AIProvider = 'anthropic' | 'openai';

/** key_hint = "…" + last 4 chars */
export type AISettings = {
  provider: AIProvider | null;
  model: string | null;
  has_key: boolean;
  key_hint: string | null;
};

export type AISettingsUpdate = {
  provider: AIProvider;
  /** omit to keep the stored key */
  api_key?: string;
  model?: string;
};

export type AIModel = { id: string; label: string };

export type AITestResult = { ok: true; model: string };

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type CardAssistAction = 'describe' | 'acceptance_criteria' | 'subtasks' | 'labels';

export type CardAssistRequest = { action: CardAssistAction; instructions?: string };

export type CardAssistSubtask = { title: string; description: string };
export type SuggestedLabel = { name: string; color: string };

export type CardAssistResult =
  | { action: 'describe'; description: string }
  | { action: 'acceptance_criteria'; criteria: string[] }
  | { action: 'subtasks'; subtasks: CardAssistSubtask[] }
  | { action: 'labels'; label_ids: number[]; new_labels: SuggestedLabel[] };

export type BoardSummaryResult = { summary: string };

export type DraftCard = {
  title: string;
  description: string;
  column_id: number;
  label_ids: number[];
  assignee_ids: number[];
  due_date: string | null;
};

export type DraftCardsRequest = { text: string; column_id?: number };
export type DraftCardsResult = { cards: DraftCard[] };

export type BoardChatRequest = { messages: ChatMessage[] };
export type BoardChatResult = { reply: string };
