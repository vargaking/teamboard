import { createContext, useContext } from 'react';
import type { BoardDetail } from '../../api/types';

/**
 * Board-page actions shared with deeply nested, memoised components (card tiles, columns).
 * Everything here is referentially stable; menus read fresh board data via getBoard() when opened.
 */
export type BoardViewActions = {
  boardId: number;
  getBoard: () => BoardDetail | undefined;
  openCard: (cardId: number) => void;
  /** Opens the inline "Add column" input at the end of the board. */
  startAddColumn: () => void;
};

export const BoardViewContext = createContext<BoardViewActions | null>(null);

export function useBoardView(): BoardViewActions {
  const ctx = useContext(BoardViewContext);
  if (ctx === null) throw new Error('useBoardView must be used inside <BoardViewContext.Provider>');
  return ctx;
}
