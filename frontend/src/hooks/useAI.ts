import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as aiApi from '../api/ai';
import type { AISettingsUpdate, CardAssistRequest, ChatMessage, DraftCardsRequest } from '../api/types';
import { queryKeys } from './queryKeys';

/** Contract limits for POST /ai/boards/{id}/chat */
export const CHAT_MAX_MESSAGES = 30;
export const CHAT_MAX_CHARS = 8000;

export function useAISettings(enabled = true) {
  return useQuery({ queryKey: queryKeys.aiSettings, queryFn: aiApi.getAISettings, enabled });
}

/** Live model list; only meaningful once a key is stored. Keyed by provider so switching refetches. */
export function useAIModels(provider: string | null, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.aiModels(provider ?? ''),
    queryFn: aiApi.listAIModels,
    enabled,
    retry: false,
    staleTime: 10 * 60 * 1000,
  });
}

export function useUpdateAISettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AISettingsUpdate) => aiApi.updateAISettings(body),
    onSuccess: (settings, body) => {
      queryClient.setQueryData(queryKeys.aiSettings, settings);
      // A new key (or provider) may expose a different model list.
      if (body.api_key !== undefined) void queryClient.invalidateQueries({ queryKey: ['ai', 'models'] });
    },
  });
}

export function useDeleteAISettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: aiApi.deleteAISettings,
    onSuccess: () => {
      queryClient.setQueryData(queryKeys.aiSettings, {
        provider: null,
        model: null,
        has_key: false,
        key_hint: null,
      });
      queryClient.removeQueries({ queryKey: ['ai', 'models'] });
    },
  });
}

export function useTestAIConnection() {
  return useMutation({ mutationFn: aiApi.testAIConnection });
}

export function useCardAssist(cardId: number) {
  return useMutation({ mutationFn: (body: CardAssistRequest) => aiApi.assistCard(cardId, body) });
}

export function useBoardSummary(boardId: number) {
  return useMutation({ mutationFn: () => aiApi.summariseBoard(boardId) });
}

export function useDraftCards(boardId: number) {
  return useMutation({ mutationFn: (body: DraftCardsRequest) => aiApi.draftCards(boardId, body) });
}

/** Stateless chat: sends the last 30 messages (each capped at 8000 chars) on every call. */
export function useBoardChat(boardId: number) {
  return useMutation({
    mutationFn: (history: ChatMessage[]) =>
      aiApi.chatWithBoard(boardId, {
        messages: history
          .slice(-CHAT_MAX_MESSAGES)
          .map((m) => ({ role: m.role, content: m.content.slice(0, CHAT_MAX_CHARS) })),
      }),
  });
}
