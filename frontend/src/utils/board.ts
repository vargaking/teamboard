import type { BoardDetail, Card, CardUpdate, Column, User } from '../api/types';

function renumber(cards: Card[]): Card[] {
  return cards.map((card, index) => (card.position === index ? card : { ...card, position: index }));
}

export function findCard(board: BoardDetail, cardId: number): { card: Card; column: Column } | null {
  for (const column of board.columns) {
    const card = column.cards.find((c) => c.id === cardId);
    if (card) return { card, column };
  }
  return null;
}

/** Move a card to `toIndex` (final index in the destination list) of `toColumnId`. */
export function moveCardInBoard(board: BoardDetail, cardId: number, toColumnId: number, toIndex: number): BoardDetail {
  const found = findCard(board, cardId);
  if (!found) return board;
  const movedCard: Card = { ...found.card, column_id: toColumnId };

  const columns = board.columns.map((column) => {
    let cards = column.cards;
    if (column.id === found.column.id) {
      cards = cards.filter((c) => c.id !== cardId);
    }
    if (column.id === toColumnId) {
      const next = [...cards];
      const index = Math.max(0, Math.min(toIndex, next.length));
      next.splice(index, 0, movedCard);
      cards = next;
    }
    if (cards === column.cards) return column;
    return { ...column, cards: renumber(cards) };
  });
  return { ...board, columns };
}

export function reorderColumnsInBoard(board: BoardDetail, fromIndex: number, toIndex: number): BoardDetail {
  const columns = [...board.columns];
  const [moved] = columns.splice(fromIndex, 1);
  if (!moved) return board;
  columns.splice(toIndex, 0, moved);
  return { ...board, columns: columns.map((c, position) => ({ ...c, position })) };
}

export function replaceCardInBoard(board: BoardDetail, card: Card): BoardDetail {
  return {
    ...board,
    columns: board.columns.map((column) =>
      column.cards.some((c) => c.id === card.id)
        ? { ...column, cards: column.cards.map((c) => (c.id === card.id ? card : c)) }
        : column,
    ),
  };
}

export function removeCardFromBoard(board: BoardDetail, cardId: number): BoardDetail {
  return {
    ...board,
    columns: board.columns.map((column) =>
      column.cards.some((c) => c.id === cardId)
        ? { ...column, cards: renumber(column.cards.filter((c) => c.id !== cardId)) }
        : column,
    ),
  };
}

/** Optimistically apply a PATCH /cards/{id} body to the cached board. */
export function applyCardUpdate(board: BoardDetail, cardId: number, update: CardUpdate): BoardDetail {
  const found = findCard(board, cardId);
  if (!found) return board;
  const { card } = found;
  const next: Card = {
    ...card,
    ...(update.title !== undefined ? { title: update.title } : {}),
    ...(update.description !== undefined ? { description: update.description } : {}),
    ...(update.due_date !== undefined ? { due_date: update.due_date } : {}),
    ...(update.assignee_ids !== undefined
      ? { assignees: board.members.filter((m) => update.assignee_ids?.includes(m.id)) }
      : {}),
    ...(update.reviewer_ids !== undefined
      ? { reviewers: board.members.filter((m) => update.reviewer_ids?.includes(m.id)) }
      : {}),
    ...(update.label_ids !== undefined
      ? { labels: board.labels.filter((l) => update.label_ids?.includes(l.id)) }
      : {}),
  };
  return replaceCardInBoard(board, next);
}

/**
 * When a filter hides some cards, the library's destination index refers to the *visible*
 * list. Translate it to an index in the full (unfiltered) destination column.
 */
export function visibleIndexToRealIndex(
  realCardIds: number[],
  visibleCardIds: number[],
  draggedCardId: number,
  visibleIndex: number,
): number {
  const real = realCardIds.filter((id) => id !== draggedCardId);
  const visible = visibleCardIds.filter((id) => id !== draggedCardId);
  if (visible.length === 0) return real.length;
  if (visibleIndex < visible.length) {
    const idx = real.indexOf(visible[visibleIndex]);
    return idx === -1 ? real.length : idx;
  }
  const lastIdx = real.indexOf(visible[visible.length - 1]);
  return lastIdx === -1 ? real.length : lastIdx + 1;
}

// ---------------------------------------------------------------- "done" columns & review counts

const DONE_TITLE = /\b(done|complete[d]?|closed|finished|shipped)\b/i;

/** Title-based "done" check: Done, Completed, Closed, Finished, Shipped (whole words, any case). */
export function isDoneColumn(title: string): boolean {
  return DONE_TITLE.test(title);
}

/**
 * Ids of the board's "done" columns: every column whose title matches isDoneColumn; if none
 * matches, the last column. Used by both overdue highlighting and review counts so they agree.
 */
export function doneColumnIds(columns: Pick<Column, 'id' | 'title'>[]): Set<number> {
  const matching = columns.filter((c) => isDoneColumn(c.title)).map((c) => c.id);
  if (matching.length > 0) return new Set(matching);
  const last = columns[columns.length - 1];
  return new Set(last ? [last.id] : []);
}

export type ReviewCount = { user: User; inProgress: number; done: number };

/**
 * Per board member: cards they review outside / inside "done" columns. Sorted by in-progress
 * desc, then done desc, then name; members with 0/0 end up last.
 */
export function reviewCounts(board: Pick<BoardDetail, 'members' | 'columns'>): ReviewCount[] {
  const done = doneColumnIds(board.columns);
  const counts = new Map<number, ReviewCount>(board.members.map((u) => [u.id, { user: u, inProgress: 0, done: 0 }]));
  for (const column of board.columns) {
    const isDone = done.has(column.id);
    for (const card of column.cards) {
      for (const reviewer of card.reviewers) {
        const entry = counts.get(reviewer.id);
        if (!entry) continue; // reviewer is no longer a board member
        if (isDone) entry.done += 1;
        else entry.inProgress += 1;
      }
    }
  }
  return [...counts.values()].sort(
    (a, b) => b.inProgress - a.inProgress || b.done - a.done || a.user.name.localeCompare(b.user.name),
  );
}

