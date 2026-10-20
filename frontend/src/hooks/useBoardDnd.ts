import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { DropResult } from '@hello-pangea/dnd';
import type { BoardDetail } from '../api/types';
import { visibleIndexToRealIndex } from '../utils/board';
import { queryKeys } from './queryKeys';
import { useBoardMoves } from './useBoardMoves';

export const COLUMN_DROPPABLE_ID = 'board-columns';
export const DND_TYPE_COLUMN = 'COLUMN';
export const DND_TYPE_CARD = 'CARD';

/**
 * Returns an onDragEnd handler that optimistically updates the board cache and then
 * calls POST /cards/{id}/move or PUT /boards/{id}/columns/order.
 */
export function useBoardDnd(
  boardId: number,
  /** Visible card ids per column when a filter is active; null when nothing is filtered. */
  visibleCardIds: ((columnId: number) => number[]) | null,
) {
  const queryClient = useQueryClient();
  const { moveCardTo, moveColumn } = useBoardMoves(boardId);

  return useCallback(
    (result: DropResult) => {
      const { source, destination, draggableId, type } = result;
      if (!destination) return;
      if (source.droppableId === destination.droppableId && source.index === destination.index) return;

      const board = queryClient.getQueryData<BoardDetail>(queryKeys.board(boardId));
      if (!board) return;

      if (type === DND_TYPE_COLUMN) {
        void moveColumn(source.index, destination.index);
        return;
      }

      // Card: destination.index is already the final index within the destination list.
      const cardId = Number(draggableId);
      const columnId = Number(destination.droppableId);
      let position = destination.index;
      if (visibleCardIds !== null) {
        const destColumn = board.columns.find((c) => c.id === columnId);
        if (destColumn) {
          position = visibleIndexToRealIndex(
            destColumn.cards.map((c) => c.id),
            visibleCardIds(columnId),
            cardId,
            destination.index,
          );
        }
      }
      void moveCardTo(cardId, columnId, position);
    },
    [boardId, moveCardTo, moveColumn, queryClient, visibleCardIds],
  );
}
