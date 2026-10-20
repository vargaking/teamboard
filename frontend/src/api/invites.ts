import { api } from './client';
import type { Invite, InviteAccept, InviteCreate, InviteInfo, Token } from './types';

export async function listInvites(): Promise<Invite[]> {
  const { data } = await api.get<Invite[]>('/invites');
  return data;
}

/** The returned `url` contains the invite token and is only ever returned here. */
export async function createInvite(body: InviteCreate): Promise<Invite> {
  const { data } = await api.post<Invite>('/invites', body);
  return data;
}

export async function revokeInvite(inviteId: number): Promise<void> {
  await api.delete(`/invites/${inviteId}`);
}

/** Public. */
export async function getInviteInfo(token: string): Promise<InviteInfo> {
  const { data } = await api.get<InviteInfo>(`/invites/${encodeURIComponent(token)}/info`);
  return data;
}

/** Public: creates the user and logs them in. 410 invalid/expired/used, 409 email exists. */
export async function acceptInvite(token: string, body: InviteAccept): Promise<Token> {
  const { data } = await api.post<Token>(`/invites/${encodeURIComponent(token)}/accept`, body);
  return data;
}
