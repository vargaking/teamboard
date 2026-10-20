import { Tooltip } from 'antd';
import type { LiveStatus } from '../hooks/useLiveSocket';

const LABELS: Record<LiveStatus, string> = {
  connected: 'Live: changes from teammates appear automatically',
  connecting: 'Connecting to live updates...',
  reconnecting: 'Reconnecting to live updates...',
  closed: 'Live updates unavailable',
};

export function LiveIndicator({ status }: { status: LiveStatus }) {
  const connected = status === 'connected';
  return (
    <Tooltip title={LABELS[status]}>
      <span className={`live-indicator ${connected ? 'is-live' : 'is-offline'}`} aria-label={LABELS[status]}>
        <span className="live-dot" />
        {connected ? 'Live' : status === 'closed' ? 'Offline' : status === 'connecting' ? 'Connecting' : 'Reconnecting'}
      </span>
    </Tooltip>
  );
}
