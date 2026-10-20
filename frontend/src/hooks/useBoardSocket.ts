import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { boardChannelUrl } from '../api/live';
import type { LiveMessage } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { consumeLocalMove } from './localMoves';
import { queryKeys } from './queryKeys';
import { useLiveSocket, type LiveStatus } from './useLiveSocket';

/** Live updates for one board (kept open while the board page is mounted). */
export function useBoardSocket(boardId: number): LiveStatus {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;
  const valid = Number.isInteger(boardId) && boardId > 0;

  const buildUrl = useCallback((token: string) => boardChannelUrl(boardId, token), [boardId]);

  const onMessage = useCallback(
    (msg: LiveMessage) => {
      if (msg.board_id !== boardId) return;
      if (msg.type === 'board.deleted') {
        queryClient.removeQueries({ queryKey: queryKeys.board(boardId) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.boards });
        void message.warning('This board was deleted');
        navigate('/', { replace: true });
        return;
      }
      if (msg.type !== 'board.updated') return;
      // Skip only the echo of a move made in *this tab* (it already applied the server's
      // BoardDetail). Same-user moves from elsewhere (another tab, an MCP client) still refetch.
      if (msg.event === 'card.moved' && msg.actor_id === currentUserId && consumeLocalMove(msg.entity_id)) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.board(boardId) });
      if (msg.event.startsWith('comment.') && msg.entity_id !== null) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.comments(msg.entity_id) });
      }
    },
    [boardId, currentUserId, message, navigate, queryClient],
  );

  const onReconnect = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.board(boardId) });
  }, [boardId, queryClient]);

  return useLiveSocket({ buildUrl, onMessage, onReconnect, enabled: valid && currentUserId !== null });
}
