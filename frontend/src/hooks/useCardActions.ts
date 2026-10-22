import { useCallback } from 'react';
import { App } from 'antd';
import { getErrorMessage } from '../api/client';
import type { BoardDetail, Card, CardUpdate } from '../api/types';
import { useCurrentUser } from '../auth/AuthContext';
import { appUrl } from '../utils/basePath';
import { copyText } from '../utils/clipboard';
import { DATE_FORMAT, dayjs } from '../utils/dates';
import { useBoardMoves } from './useBoardMoves';
import { useDeleteCard, useUpdateCard } from './useCards';

export type DuePreset = 'today' | 'tomorrow' | 'next_monday' | 'clear';

/** Date for a due preset; "next Monday" is always strictly after today. */
export function duePresetDate(preset: DuePreset): string | null {
  const today = dayjs();
  switch (preset) {
    case 'today':
      return today.format(DATE_FORMAT);
    case 'tomorrow':
      return today.add(1, 'day').format(DATE_FORMAT);
    case 'next_monday': {
      const diff = (8 - today.day()) % 7 || 7;
      return today.add(diff, 'day').format(DATE_FORMAT);
    }
    case 'clear':
      return null;
  }
}

export function cardLink(boardId: number, cardId: number): string {
  return appUrl(`boards/${boardId}?card=${cardId}`);
}

/** Quick card actions used by the card context menu. */
export function useCardActions(boardId: number) {
  const user = useCurrentUser();
  const { message, modal } = App.useApp();
  const updateCard = useUpdateCard(boardId);
  const deleteCard = useDeleteCard(boardId);
  const { moveCardTo } = useBoardMoves(boardId);

  const patch = useCallback(
    (card: Card, update: CardUpdate, errorText: string) =>
      updateCard.mutate(
        { cardId: card.id, update },
        { onError: (err) => void message.error(getErrorMessage(err, errorText)) },
      ),
    // updateCard.mutate is stable across renders
    [message, updateCard.mutate],
  );

  const moveToColumnEnd = useCallback(
    (board: BoardDetail, card: Card, columnId: number) => {
      const target = board.columns.find((c) => c.id === columnId);
      if (!target) return;
      // Append: position = the destination column's card count.
      void moveCardTo(card.id, columnId, target.cards.length).then((res) => {
        if (res) void message.success(`Moved to "${target.title}"`);
      });
    },
    [message, moveCardTo],
  );

  /** Toggle one person in the card's assignees or reviewers (PATCH replaces the full set). */
  const togglePerson = useCallback(
    (card: Card, role: 'assignee' | 'reviewer', userId: number) => {
      const people = role === 'assignee' ? card.assignees : card.reviewers;
      const ids = people.map((p) => p.id);
      const next = ids.includes(userId) ? ids.filter((id) => id !== userId) : [...ids, userId];
      patch(
        card,
        role === 'assignee' ? { assignee_ids: next } : { reviewer_ids: next },
        role === 'assignee' ? 'Could not update assignees' : 'Could not update reviewers',
      );
    },
    [patch],
  );

  const setDue = useCallback(
    (card: Card, preset: DuePreset) => patch(card, { due_date: duePresetDate(preset) }, 'Could not set due date'),
    [patch],
  );

  const toggleLabel = useCallback(
    (card: Card, labelId: number) => {
      const ids = card.labels.map((l) => l.id);
      const next = ids.includes(labelId) ? ids.filter((id) => id !== labelId) : [...ids, labelId];
      patch(card, { label_ids: next }, 'Could not update labels');
    },
    [patch],
  );

  const copyLink = useCallback(
    (card: Card) =>
      copyText(cardLink(boardId, card.id)).then(
        () => void message.success('Card link copied'),
        () => void message.error('Could not copy to clipboard'),
      ),
    [boardId, message],
  );

  const confirmDelete = useCallback(
    (card: Card) =>
      modal.confirm({
        title: `Delete card "${card.title}"?`,
        content: 'Its comments will be deleted too. This cannot be undone.',
        okText: 'Delete',
        okButtonProps: { danger: true },
        onOk: () =>
          deleteCard.mutateAsync(card.id).then(
            () => void message.success('Card deleted'),
            (err: unknown) => void message.error(getErrorMessage(err, 'Could not delete card')),
          ),
      }),
    // deleteCard.mutateAsync is stable across renders
    [deleteCard.mutateAsync, message, modal],
  );

  return { moveToColumnEnd, togglePerson, setDue, toggleLabel, copyLink, confirmDelete, userId: user.id };
}
