import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import type { DropResult } from '@hello-pangea/dnd';
import { moveCard } from '../api/cards';
import { reorderColumns } from '../api/boards';
import { getErrorMessage } from '../api/client';
import type { BoardDetail } from '../api/types';
import { moveCardInBoard, reorderColumnsInBoard, visibleIndexToRealIndex } from '../utils/board';
import { queryKeys } from './queryKeys';

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
  const { message } = App.useApp();
  const key = queryKeys.board(boardId);

  return useCallback(
    (result: DropResult) => {
      const { source, destination, draggableId, type } = result;
      if (!destination) return;
      if (source.droppableId === destination.droppableId && source.index === destination.index) return;

      const board = queryClient.getQueryData<BoardDetail>(key);
      if (!board) return;

      // Don't let an in-flight refetch overwrite the optimistic state.
      void queryClient.cancelQueries({ queryKey: key });

      if (type === DND_TYPE_COLUMN) {
        const next = reorderColumnsInBoard(board, source.index, destination.index);
        queryClient.setQueryData(key, next);
        reorderColumns(boardId, { column_ids: next.columns.map((c) => c.id) })
          .then((updated) => queryClient.setQueryData(key, updated))
          .catch((err: unknown) => {
            void queryClient.invalidateQueries({ queryKey: key });
            void message.error(getErrorMessage(err, 'Could not reorder columns'));
          });
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
      queryClient.setQueryData(key, moveCardInBoard(board, cardId, columnId, position));
      moveCard(cardId, { column_id: columnId, position })
        .then((updated) => queryClient.setQueryData(key, updated))
        .catch((err: unknown) => {
          void queryClient.invalidateQueries({ queryKey: key });
          void message.error(getErrorMessage(err, 'Could not move card'));
        });
    },
    [boardId, key, message, queryClient, visibleCardIds],
  );
}
