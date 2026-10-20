import { useEffect, useRef, useState } from 'react';
import { clearToken, getToken } from '../api/client';
import { NON_RETRYABLE_CLOSE_CODES, WS_CLOSE_BAD_TOKEN, WS_CLOSE_NORMAL, parseLiveMessage } from '../api/live';
import type { LiveMessage } from '../api/types';

export type LiveStatus = 'connecting' | 'connected' | 'reconnecting' | 'closed';

const PING_INTERVAL_MS = 25_000;
const BACKOFF_INITIAL_MS = 1_000;
const BACKOFF_MAX_MS = 15_000;

type Options = {
  /** Builds the socket URL from the JWT; return null (or pass enabled=false) to stay disconnected. */
  buildUrl: (token: string) => string | null;
  onMessage: (message: LiveMessage) => void;
  /** Called once when the server closes with a non-retryable code (4401/4403/4404). */
  onFatalClose?: (code: number) => void;
  /** Called when a connection opens after a drop (events may have been missed meanwhile). */
  onReconnect?: () => void;
  enabled?: boolean;
};

/**
 * Keeps one WebSocket open, pings every 25 s, and reconnects with exponential backoff
 * (1 s doubling up to 15 s) unless the server closed with 1000/4401/4403/4404.
 * The URL is rebuilt on each (re)connect so a fresh token is always used.
 */
export function useLiveSocket({ buildUrl, onMessage, onFatalClose, onReconnect, enabled = true }: Options): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>('connecting');

  // Keep latest callbacks without reconnecting when they change identity.
  const onMessageRef = useRef(onMessage);
  const onFatalCloseRef = useRef(onFatalClose);
  const buildUrlRef = useRef(buildUrl);
  const onReconnectRef = useRef(onReconnect);
  onMessageRef.current = onMessage;
  onReconnectRef.current = onReconnect;
  onFatalCloseRef.current = onFatalClose;
  buildUrlRef.current = buildUrl;

  // Reconnect only when the target changes: derive a stable key from the URL without the token.
  const targetKey = enabled ? buildUrl('') : null;

  useEffect(() => {
    if (targetKey === null) {
      setStatus('closed');
      return;
    }

    let disposed = false;
    let socket: WebSocket | null = null;
    let pingTimer: number | undefined;
    let retryTimer: number | undefined;
    let attempt = 0;
    let hasConnected = false;

    const stopPing = () => {
      if (pingTimer !== undefined) window.clearInterval(pingTimer);
      pingTimer = undefined;
    };

    const scheduleReconnect = () => {
      const delay = Math.min(BACKOFF_INITIAL_MS * 2 ** attempt, BACKOFF_MAX_MS);
      attempt += 1;
      setStatus('reconnecting');
      retryTimer = window.setTimeout(connect, delay);
    };

    function connect() {
      retryTimer = undefined;
      if (disposed) return;
      const token = getToken();
      const url = token === null ? null : buildUrlRef.current(token);
      if (url === null) {
        setStatus('closed');
        return;
      }

      const ws = new WebSocket(url);
      socket = ws;

      ws.onopen = () => {
        if (disposed) return;
        attempt = 0;
        setStatus('connected');
        if (hasConnected) onReconnectRef.current?.();
        hasConnected = true;
        stopPing();
        pingTimer = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send('ping');
        }, PING_INTERVAL_MS);
      };

      ws.onmessage = (event: MessageEvent<unknown>) => {
        if (disposed) return;
        const message = parseLiveMessage(event.data);
        if (message !== null) onMessageRef.current(message);
      };

      ws.onclose = (event: CloseEvent) => {
        stopPing();
        if (socket === ws) socket = null;
        if (disposed) return;
        if (NON_RETRYABLE_CLOSE_CODES.has(event.code)) {
          setStatus('closed');
          if (event.code === WS_CLOSE_BAD_TOKEN) {
            // Same treatment as an HTTP 401.
            clearToken();
            if (window.location.pathname !== '/login') window.location.assign('/login');
          }
          if (event.code !== WS_CLOSE_NORMAL) onFatalCloseRef.current?.(event.code);
          return;
        }
        scheduleReconnect();
      };
      // onerror is always followed by onclose, which handles reconnection.
    }

    setStatus('connecting');
    connect();

    return () => {
      disposed = true;
      stopPing();
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      const ws = socket;
      socket = null;
      if (ws === null) return;
      if (ws.readyState === WebSocket.CONNECTING) {
        // Closing a CONNECTING socket logs a browser warning (common under StrictMode's
        // double-mount); close it as soon as it opens instead.
        ws.onopen = () => ws.close(WS_CLOSE_NORMAL);
        ws.onmessage = null;
      } else if (ws.readyState === WebSocket.OPEN) {
        ws.close(WS_CLOSE_NORMAL);
      }
    };
  }, [targetKey]);

  return status;
}
