import { api } from './client';
import type {
  AIModel,
  AISettings,
  AISettingsUpdate,
  AITestResult,
  BoardChatRequest,
  BoardChatResult,
  BoardSummaryResult,
  CardAssistRequest,
  CardAssistResult,
  DraftCardsRequest,
  DraftCardsResult,
} from './types';

/** AI calls take several seconds; give them more room than a normal request. */
const AI_TIMEOUT_MS = 120_000;

export async function getAISettings(): Promise<AISettings> {
  const { data } = await api.get<AISettings>('/ai/settings');
  return data;
}

export async function updateAISettings(body: AISettingsUpdate): Promise<AISettings> {
  const { data } = await api.put<AISettings>('/ai/settings', body);
  return data;
}

export async function deleteAISettings(): Promise<void> {
  await api.delete('/ai/settings');
}

export async function listAIModels(): Promise<AIModel[]> {
  const { data } = await api.get<AIModel[]>('/ai/models', { timeout: AI_TIMEOUT_MS });
  return data;
}

export async function testAIConnection(): Promise<AITestResult> {
  const { data } = await api.post<AITestResult>('/ai/test', undefined, { timeout: AI_TIMEOUT_MS });
  return data;
}

export async function assistCard(cardId: number, body: CardAssistRequest): Promise<CardAssistResult> {
  const { data } = await api.post<CardAssistResult>(`/ai/cards/${cardId}/assist`, body, { timeout: AI_TIMEOUT_MS });
  return data;
}

export async function summariseBoard(boardId: number): Promise<BoardSummaryResult> {
  const { data } = await api.post<BoardSummaryResult>(`/ai/boards/${boardId}/summary`, undefined, {
    timeout: AI_TIMEOUT_MS,
  });
  return data;
}

export async function draftCards(boardId: number, body: DraftCardsRequest): Promise<DraftCardsResult> {
  const { data } = await api.post<DraftCardsResult>(`/ai/boards/${boardId}/draft-cards`, body, {
    timeout: AI_TIMEOUT_MS,
  });
  return data;
}

export async function chatWithBoard(boardId: number, body: BoardChatRequest): Promise<BoardChatResult> {
  const { data } = await api.post<BoardChatResult>(`/ai/boards/${boardId}/chat`, body, { timeout: AI_TIMEOUT_MS });
  return data;
}
