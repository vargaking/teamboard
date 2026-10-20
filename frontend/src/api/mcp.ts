import { api } from './client';
import type {
  McpInfo,
  OAuthConsentDecision,
  OAuthConsentInfo,
  OAuthConsentResult,
  PersonalToken,
  PersonalTokenCreate,
  PersonalTokenCreated,
} from './types';

export async function getMcpInfo(): Promise<McpInfo> {
  const { data } = await api.get<McpInfo>('/mcp-info');
  return data;
}

export async function listTokens(): Promise<PersonalToken[]> {
  const { data } = await api.get<PersonalToken[]>('/tokens');
  return data;
}

export async function createToken(body: PersonalTokenCreate): Promise<PersonalTokenCreated> {
  const { data } = await api.post<PersonalTokenCreated>('/tokens', body);
  return data;
}

export async function revokeToken(tokenId: number): Promise<void> {
  await api.delete(`/tokens/${tokenId}`);
}

export async function getConsentInfo(req: string): Promise<OAuthConsentInfo> {
  const { data } = await api.get<OAuthConsentInfo>('/oauth/consent', { params: { req } });
  return data;
}

export async function decideConsent(body: OAuthConsentDecision): Promise<OAuthConsentResult> {
  const { data } = await api.post<OAuthConsentResult>('/oauth/consent', body);
  return data;
}
