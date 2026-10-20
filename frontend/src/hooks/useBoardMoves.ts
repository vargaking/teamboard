import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { moveCard } from '../api/cards';
import { reorderColumns } from '../api/boards';
import { getErrorMessage } from '../api/client';
import type { BoardDetail } from '../api/types';
import { moveCardInBoard, reorderColumnsInBoard } from '../utils/board';
import { queryKeys } from './queryKeys';

/**
 * Optimistic card move / column reorder shared by drag-and-drop and the context menus.
 * Each applies the change to the cache immediately, then replaces it with the server's
 * BoardDetail; on error the board is refetched and an error is shown.
 */
export function useBoardMoves(boardId: number) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();

  const moveCardTo = useCallback(
    (cardId: number, columnId: number, position: number): Promise<BoardDetail | null> => {
      const key = queryKeys.board(boardId);
      const board = queryClient.getQueryData<BoardDetail>(key);
      void queryClient.cancelQueries({ queryKey: key });
      if (board) queryClient.setQueryData(key, moveCardInBoard(board, cardId, columnId, position));
      return moveCard(cardId, { column_id: columnId, position })
        .then((updated) => {
          queryClient.setQueryData(key, updated);
          return updated;
        })
        .catch((err: unknown) => {
          void queryClient.invalidateQueries({ queryKey: key });
          void message.error(getErrorMessage(err, 'Could not move card'));
          return null;
        });
    },
    [boardId, message, queryClient],
  );

  const moveColumn = useCallback(
    (fromIndex: number, toIndex: number): Promise<BoardDetail | null> => {
      const key = queryKeys.board(boardId);
      const board = queryClient.getQueryData<BoardDetail>(key);
      if (!board || fromIndex === toIndex || toIndex < 0 || toIndex >= board.columns.length) {
        return Promise.resolve(null);
      }
      void queryClient.cancelQueries({ queryKey: key });
      const next = reorderColumnsInBoard(board, fromIndex, toIndex);
      queryClient.setQueryData(key, next);
      return reorderColumns(boardId, { column_ids: next.columns.map((c) => c.id) })
        .then((updated) => {
          queryClient.setQueryData(key, updated);
          return updated;
        })
        .catch((err: unknown) => {
          void queryClient.invalidateQueries({ queryKey: key });
          void message.error(getErrorMessage(err, 'Could not reorder columns'));
          return null;
        });
    },
    [boardId, message, queryClient],
  );

  return { moveCardTo, moveColumn };
}
