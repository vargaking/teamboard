import { useQuery } from '@tanstack/react-query';
import { listUsers } from '../api/users';
import { queryKeys } from './queryKeys';

export function useUsers() {
  return useQuery({
    queryKey: queryKeys.users,
    queryFn: listUsers,
    staleTime: 5 * 60 * 1000,
  });
}
