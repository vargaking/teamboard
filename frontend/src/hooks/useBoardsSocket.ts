import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { boardsChannelUrl } from '../api/live';
import type { LiveMessage } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { queryKeys } from './queryKeys';
import { useLiveSocket, type LiveStatus } from './useLiveSocket';

/** Live updates for the board list (global channel). */
export function useBoardsSocket(): LiveStatus {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const onMessage = useCallback(
    (msg: LiveMessage) => {
      if (msg.type === 'boards.changed' || msg.type === 'board.deleted') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.boards });
      }
    },
    [queryClient],
  );

  const onReconnect = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.boards });
  }, [queryClient]);

  return useLiveSocket({ buildUrl: boardsChannelUrl, onMessage, onReconnect, enabled: user !== null });
}
