import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as mcpApi from '../api/mcp';
import type { PersonalToken } from '../api/types';
import { queryKeys } from './queryKeys';

export function useMcpInfo(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.mcpInfo, queryFn: mcpApi.getMcpInfo, enabled, staleTime: 5 * 60 * 1000 });
}

export function useTokens(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.tokens, queryFn: mcpApi.listTokens, enabled });
}

export function useCreateToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => mcpApi.createToken({ name }),
    onSuccess: (created) => {
      // Store only the listable fields; the secret stays in the modal's local state.
      const { token: _secret, ...listed } = created;
      queryClient.setQueryData<PersonalToken[]>(queryKeys.tokens, (old) => (old ? [...old, listed] : [listed]));
      void queryClient.invalidateQueries({ queryKey: queryKeys.tokens });
    },
  });
}

export function useRevokeToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tokenId: number) => mcpApi.revokeToken(tokenId),
    onSuccess: (_data, tokenId) => {
      queryClient.setQueryData<PersonalToken[]>(queryKeys.tokens, (old) => old?.filter((t) => t.id !== tokenId));
      void queryClient.invalidateQueries({ queryKey: queryKeys.tokens });
    },
  });
}

export function useConsentInfo(req: string | null) {
  return useQuery({
    queryKey: queryKeys.consent(req ?? ''),
    queryFn: () => mcpApi.getConsentInfo(req ?? ''),
    enabled: req !== null && req !== '',
    retry: false,
    staleTime: Infinity,
  });
}

export function useConsentDecision() {
  return useMutation({ mutationFn: mcpApi.decideConsent });
}
