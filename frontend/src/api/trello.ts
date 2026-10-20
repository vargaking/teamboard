import { api } from './client';
import type { BoardDetail, TrelloImportRequest, TrelloPreview, TrelloPreviewRequest } from './types';

/** Exports can be several MB; give the upload + server-side processing time. */
const IMPORT_TIMEOUT_MS = 120_000;

/** Request bodies are capped at 30 MB by the backend (and nginx). */
export const TRELLO_MAX_BYTES = 30 * 1024 * 1024;

export async function previewTrelloImport(body: TrelloPreviewRequest): Promise<TrelloPreview> {
  const { data } = await api.post<TrelloPreview>('/boards/import/trello/preview', body, { timeout: IMPORT_TIMEOUT_MS });
  return data;
}

export async function importTrelloBoard(body: TrelloImportRequest): Promise<BoardDetail> {
  const { data } = await api.post<BoardDetail>('/boards/import/trello', body, { timeout: IMPORT_TIMEOUT_MS });
  return data;
}
