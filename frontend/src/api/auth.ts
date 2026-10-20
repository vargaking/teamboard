import { api } from './client';
import type { ChangePasswordRequest, LoginRequest, Token, User } from './types';

export async function login(body: LoginRequest): Promise<Token> {
  const { data } = await api.post<Token>('/auth/login', body);
  return data;
}

export async function getMe(): Promise<User> {
  const { data } = await api.get<User>('/auth/me');
  return data;
}

export async function changePassword(body: ChangePasswordRequest): Promise<User> {
  const { data } = await api.post<User>('/auth/change-password', body);
  return data;
}
