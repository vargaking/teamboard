import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as invitesApi from '../api/invites';
import * as usersApi from '../api/users';
import type { Invite, InviteCreate, User, UserCreate, UserUpdate } from '../api/types';
import { queryKeys } from './queryKeys';

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UserCreate) => usersApi.createUser(body),
    onSuccess: (user) => {
      queryClient.setQueryData<User[]>(queryKeys.users, (old) => (old ? [...old, user] : [user]));
      void queryClient.invalidateQueries({ queryKey: queryKeys.users });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, update }: { userId: number; update: UserUpdate }) => usersApi.updateUser(userId, update),
    onSuccess: (user) => {
      queryClient.setQueryData<User[]>(queryKeys.users, (old) => old?.map((u) => (u.id === user.id ? user : u)));
      void queryClient.invalidateQueries({ queryKey: queryKeys.users });
    },
  });
}

export function useInvites(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.invites, queryFn: invitesApi.listInvites, enabled });
}

export function useCreateInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: InviteCreate) => invitesApi.createInvite(body),
    // The secret URL stays in the modal's local state; the list never stores it.
    onSuccess: (invite) => {
      queryClient.setQueryData<Invite[]>(queryKeys.invites, (old) => [{ ...invite, url: null }, ...(old ?? [])]);
      void queryClient.invalidateQueries({ queryKey: queryKeys.invites });
    },
  });
}

export function useRevokeInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: number) => invitesApi.revokeInvite(inviteId),
    onSuccess: (_d, inviteId) => {
      queryClient.setQueryData<Invite[]>(queryKeys.invites, (old) =>
        old?.map((i) => (i.id === inviteId ? { ...i, revoked: true } : i)),
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.invites });
    },
  });
}

export function useInviteInfo(token: string | undefined) {
  return useQuery({
    queryKey: queryKeys.inviteInfo(token ?? ''),
    queryFn: () => invitesApi.getInviteInfo(token ?? ''),
    enabled: Boolean(token),
    retry: false,
    staleTime: Infinity,
  });
}
