import { useEffect, useState } from 'react';
import { Alert } from 'antd';
import axios from 'axios';
import { API_BASE } from '../utils/basePath';

const SLOW_AFTER_MS = 2500;
const RETRY_EVERY_MS = 4000;
const PROBE_TIMEOUT_MS = 90_000; // a sleeping free-tier instance can take ~a minute to answer

type Status = 'checking' | 'ok' | 'waking' | 'down';

/**
 * Probes GET /api/health once on load. If the API does not answer quickly (free-tier hosting that sleeps when
 * idle) a banner explains the wait and keeps retrying until the API is up; the rest of the app keeps rendering.
 */
export function BackendStatusBanner() {
  const [status, setStatus] = useState<Status>('checking');

  useEffect(() => {
    let cancelled = false;
    let slowTimer: number | undefined;
    let retryTimer: number | undefined;

    const probe = async () => {
      slowTimer = window.setTimeout(() => {
        if (!cancelled) setStatus((s) => (s === 'ok' ? s : 'waking'));
      }, SLOW_AFTER_MS);
      try {
        await axios.get(`${API_BASE}/health`, { timeout: PROBE_TIMEOUT_MS });
        if (!cancelled) setStatus('ok');
      } catch {
        if (!cancelled) {
          setStatus('down');
          retryTimer = window.setTimeout(() => void probe(), RETRY_EVERY_MS);
        }
      } finally {
        if (slowTimer !== undefined) window.clearTimeout(slowTimer);
      }
    };
    void probe();

    return () => {
      cancelled = true;
      if (slowTimer !== undefined) window.clearTimeout(slowTimer);
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, []);

  if (status === 'ok' || status === 'checking') return null;
  return (
    <Alert
      banner
      type={status === 'down' ? 'error' : 'warning'}
      showIcon
      message={
        status === 'down'
          ? 'The server is not reachable right now. Retrying…'
          : 'The server is waking up (free hosting sleeps when idle). This usually takes 30–60 seconds; your request will go through automatically.'
      }
      data-testid="backend-status"
    />
  );
}
