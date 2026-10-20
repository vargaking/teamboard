import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as cardsApi from '../api/cards';
import type { BoardDetail, CardUpdate } from '../api/types';
import { applyCardUpdate, removeCardFromBoard, replaceCardInBoard } from '../utils/board';
import { queryKeys } from './queryKeys';

export function useCreateCard(boardId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ columnId, title }: { columnId: number; title: string }) =>
      cardsApi.createCard(columnId, { title }),
    onSuccess: (card) => {
      queryClient.setQueryData<BoardDetail>(queryKeys.board(boardId), (old) =>
        old
          ? {
              ...old,
              columns: old.columns.map((c) =>
                c.id === card.column_id && !c.cards.some((x) => x.id === card.id)
                  ? { ...c, cards: [...c.cards, card] }
                  : c,
              ),
            }
          : old,
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.board(boardId) }),
  });
}

export function useUpdateCard(boardId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cardId, update }: { cardId: number; update: CardUpdate }) => cardsApi.updateCard(cardId, update),
    onMutate: async ({ cardId, update }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.board(boardId) });
      const previous = queryClient.getQueryData<BoardDetail>(queryKeys.board(boardId));
      if (previous) {
        queryClient.setQueryData(queryKeys.board(boardId), applyCardUpdate(previous, cardId, update));
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.board(boardId), context.previous);
    },
    onSuccess: (card) => {
      queryClient.setQueryData<BoardDetail>(queryKeys.board(boardId), (old) =>
        old ? replaceCardInBoard(old, card) : old,
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.board(boardId) }),
  });
}

export function useDeleteCard(boardId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cardId: number) => cardsApi.deleteCard(cardId),
    onSuccess: (_data, cardId) => {
      queryClient.setQueryData<BoardDetail>(queryKeys.board(boardId), (old) =>
        old ? removeCardFromBoard(old, cardId) : old,
      );
      queryClient.removeQueries({ queryKey: queryKeys.comments(cardId) });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.board(boardId) }),
  });
}

// ---- comments ----

export function useComments(cardId: number) {
  return useQuery({
    queryKey: queryKeys.comments(cardId),
    queryFn: () => cardsApi.listComments(cardId),
  });
}

export function useCreateComment(boardId: number, cardId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => cardsApi.createComment(cardId, { body }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.comments(cardId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.board(boardId) });
    },
  });
}

export function useDeleteComment(boardId: number, cardId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: number) => cardsApi.deleteComment(commentId),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.comments(cardId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.board(boardId) });
    },
  });
}
