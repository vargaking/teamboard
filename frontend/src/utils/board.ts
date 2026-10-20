import type { BoardDetail, Card, CardUpdate, Column } from '../api/types';

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
