import { api } from './client';
import type {
  BoardCreate,
  BoardDetail,
  BoardMembersUpdate,
  BoardSummary,
  BoardUpdate,
  Column,
  ColumnCreate,
  ColumnOrder,
  ColumnUpdate,
  Label,
  LabelCreate,
  LabelUpdate,
} from './types';

// ---- boards ----

export async function listBoards(): Promise<BoardSummary[]> {
  const { data } = await api.get<BoardSummary[]>('/boards');
  return data;
}

export async function createBoard(body: BoardCreate): Promise<BoardDetail> {
  const { data } = await api.post<BoardDetail>('/boards', body);
  return data;
}

export async function getBoard(boardId: number): Promise<BoardDetail> {
  const { data } = await api.get<BoardDetail>(`/boards/${boardId}`);
  return data;
}

export async function updateBoard(boardId: number, body: BoardUpdate): Promise<BoardDetail> {
  const { data } = await api.patch<BoardDetail>(`/boards/${boardId}`, body);
  return data;
}

export async function deleteBoard(boardId: number): Promise<void> {
  await api.delete(`/boards/${boardId}`);
}

export async function setBoardMembers(boardId: number, body: BoardMembersUpdate): Promise<BoardDetail> {
  const { data } = await api.put<BoardDetail>(`/boards/${boardId}/members`, body);
  return data;
}

// ---- labels ----

export async function createLabel(boardId: number, body: LabelCreate): Promise<Label> {
  const { data } = await api.post<Label>(`/boards/${boardId}/labels`, body);
  return data;
}

export async function updateLabel(labelId: number, body: LabelUpdate): Promise<Label> {
  const { data } = await api.patch<Label>(`/labels/${labelId}`, body);
  return data;
}

export async function deleteLabel(labelId: number): Promise<void> {
  await api.delete(`/labels/${labelId}`);
}

// ---- columns ----

export async function createColumn(boardId: number, body: ColumnCreate): Promise<Column> {
  const { data } = await api.post<Column>(`/boards/${boardId}/columns`, body);
  return data;
}

export async function updateColumn(columnId: number, body: ColumnUpdate): Promise<Column> {
  const { data } = await api.patch<Column>(`/columns/${columnId}`, body);
  return data;
}

export async function reorderColumns(boardId: number, body: ColumnOrder): Promise<BoardDetail> {
  const { data } = await api.put<BoardDetail>(`/boards/${boardId}/columns/order`, body);
  return data;
}

export async function deleteColumn(columnId: number): Promise<void> {
  await api.delete(`/columns/${columnId}`);
}
