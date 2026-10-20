import { api } from './client';
import type { User } from './types';

export async function listUsers(): Promise<User[]> {
  const { data } = await api.get<User[]>('/users');
  return data;
}
