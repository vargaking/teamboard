import type { LiveMessage } from './types';
import { API_BASE } from '../utils/basePath';

/** Close codes the server uses for non-retryable failures. */
export const WS_CLOSE_BAD_TOKEN = 4401;
export const WS_CLOSE_FORBIDDEN = 4403;
export const WS_CLOSE_NOT_FOUND = 4404;
export const WS_CLOSE_NORMAL = 1000;

export const NON_RETRYABLE_CLOSE_CODES: ReadonlySet<number> = new Set([
  WS_CLOSE_NORMAL,
  WS_CLOSE_BAD_TOKEN,
  WS_CLOSE_FORBIDDEN,
  WS_CLOSE_NOT_FOUND,
]);

function wsBase(): string {
  // API_BASE is absolute ("https://host/api") when the API is hosted separately, otherwise a path.
  const absolute = API_BASE.startsWith('http') ? API_BASE : `${window.location.origin}${API_BASE}`;
  return absolute.replace(/^http/, 'ws');
}

export function boardChannelUrl(boardId: number, token: string): string {
  return `${wsBase()}/ws/boards/${boardId}?token=${encodeURIComponent(token)}`;
}

export function boardsChannelUrl(token: string): string {
  return `${wsBase()}/ws/boards?token=${encodeURIComponent(token)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Parse a server frame; returns null for "pong" and anything that is not a known JSON event. */
export function parseLiveMessage(raw: unknown): LiveMessage | null {
  if (typeof raw !== 'string' || raw === 'pong') return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data) || typeof data.board_id !== 'number') return null;
  const boardId = data.board_id;
  switch (data.type) {
    case 'board.deleted':
      return { type: 'board.deleted', board_id: boardId };
    case 'board.updated':
      if (typeof data.event !== 'string' || typeof data.actor_id !== 'number') return null;
      return {
        type: 'board.updated',
        board_id: boardId,
        event: data.event,
        actor_id: data.actor_id,
        entity_id: typeof data.entity_id === 'number' ? data.entity_id : null,
      };
    case 'boards.changed':
      if (typeof data.event !== 'string' || typeof data.actor_id !== 'number') return null;
      return { type: 'boards.changed', board_id: boardId, event: data.event, actor_id: data.actor_id };
    default:
      return null;
  }
}
