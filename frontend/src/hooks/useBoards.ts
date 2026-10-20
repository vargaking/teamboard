import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as boardsApi from '../api/boards';
import type { BoardCreate, BoardDetail, BoardUpdate } from '../api/types';
import { queryKeys } from './queryKeys';

export function useBoardList() {
  return useQuery({ queryKey: queryKeys.boards, queryFn: boardsApi.listBoards });
}

export function useBoard(boardId: number) {
  return useQuery({
    queryKey: queryKeys.board(boardId),
    queryFn: () => boardsApi.getBoard(boardId),
    enabled: Number.isInteger(boardId) && boardId > 0,
  });
}

export function useCreateBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: BoardCreate) => boardsApi.createBoard(body),
    onSuccess: (board) => {
      queryClient.setQueryData(queryKeys.board(board.id), board);
      void queryClient.invalidateQueries({ queryKey: queryKeys.boards });
    },
  });
}

/** Helper: write a full BoardDetail response into the cache. */
function useSetBoard(boardId: number) {
  const queryClient = useQueryClient();
  return (board: BoardDetail) => queryClient.setQueryData(queryKeys.board(boardId), board);
}

export function useUpdateBoard(boardId: number) {
  const queryClient = useQueryClient();
  const setBoard = useSetBoard(boardId);
  return useMutation({
    mutationFn: (body: BoardUpdate) => boardsApi.updateBoard(boardId, body),
    onSuccess: (board) => {
      setBoard(board);
      void queryClient.invalidateQueries({ queryKey: queryKeys.boards });
    },
  });
}

export function useDeleteBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (boardId: number) => boardsApi.deleteBoard(boardId),
    onSuccess: (_data, boardId) => {
      queryClient.removeQueries({ queryKey: queryKeys.board(boardId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.boards });
    },
  });
}

export function useSetBoardMembers(boardId: number) {
  const queryClient = useQueryClient();
  const setBoard = useSetBoard(boardId);
  return useMutation({
    mutationFn: (userIds: number[]) => boardsApi.setBoardMembers(boardId, { user_ids: userIds }),
    onSuccess: (board) => {
      setBoard(board);
      void queryClient.invalidateQueries({ queryKey: queryKeys.boards });
    },
  });
}

// ---- labels ----

export function useCreateLabel(boardId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; color: string }) => boardsApi.createLabel(boardId, body),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.board(boardId) }),
  });
}

export function useUpdateLabel(boardId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ labelId, name, color }: { labelId: number; name?: string; color?: string }) =>
      boardsApi.updateLabel(labelId, { name, color }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.board(boardId) }),
  });
}

export function useDeleteLabel(boardId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (labelId: number) => boardsApi.deleteLabel(labelId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.board(boardId) }),
  });
}

// ---- columns ----

export function useCreateColumn(boardId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => boardsApi.createColumn(boardId, { title }),
    onSuccess: (column) => {
      queryClient.setQueryData<BoardDetail>(queryKeys.board(boardId), (old) =>
        old && !old.columns.some((c) => c.id === column.id) ? { ...old, columns: [...old.columns, column] } : old,
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.board(boardId) }),
  });
}

export function useUpdateColumn(boardId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ columnId, title }: { columnId: number; title: string }) =>
      boardsApi.updateColumn(columnId, { title }),
    onMutate: async ({ columnId, title }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.board(boardId) });
      queryClient.setQueryData<BoardDetail>(queryKeys.board(boardId), (old) =>
        old ? { ...old, columns: old.columns.map((c) => (c.id === columnId ? { ...c, title } : c)) } : old,
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.board(boardId) }),
  });
}

export function useDeleteColumn(boardId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (columnId: number) => boardsApi.deleteColumn(columnId),
    onSuccess: (_data, columnId) => {
      queryClient.setQueryData<BoardDetail>(queryKeys.board(boardId), (old) =>
        old ? { ...old, columns: old.columns.filter((c) => c.id !== columnId) } : old,
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.board(boardId) }),
  });
}
