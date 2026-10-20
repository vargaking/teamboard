import { api } from './client';
import type { BoardDetail, Card, CardCreate, CardMove, CardUpdate, Comment, CommentCreate } from './types';

export async function createCard(columnId: number, body: CardCreate): Promise<Card> {
  const { data } = await api.post<Card>(`/columns/${columnId}/cards`, body);
  return data;
}

export async function updateCard(cardId: number, body: CardUpdate): Promise<Card> {
  const { data } = await api.patch<Card>(`/cards/${cardId}`, body);
  return data;
}

export async function moveCard(cardId: number, body: CardMove): Promise<BoardDetail> {
  const { data } = await api.post<BoardDetail>(`/cards/${cardId}/move`, body);
  return data;
}

export async function deleteCard(cardId: number): Promise<void> {
  await api.delete(`/cards/${cardId}`);
}

export async function listComments(cardId: number): Promise<Comment[]> {
  const { data } = await api.get<Comment[]>(`/cards/${cardId}/comments`);
  return data;
}

export async function createComment(cardId: number, body: CommentCreate): Promise<Comment> {
  const { data } = await api.post<Comment>(`/cards/${cardId}/comments`, body);
  return data;
}

export async function deleteComment(commentId: number): Promise<void> {
  await api.delete(`/comments/${commentId}`);
}
