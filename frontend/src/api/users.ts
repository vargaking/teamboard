import { api } from './client';
import type { User, UserCreate, UserUpdate } from './types';

export async function listUsers(): Promise<User[]> {
  const { data } = await api.get<User[]>('/users');
  return data;
}

/** Admin only. 409 if the email exists. */
export async function createUser(body: UserCreate): Promise<User> {
  const { data } = await api.post<User>('/users', body);
  return data;
}

/** Admin only. An admin cannot remove their own admin flag. */
export async function updateUser(userId: number, body: UserUpdate): Promise<User> {
  const { data } = await api.patch<User>(`/users/${userId}`, body);
  return data;
}
