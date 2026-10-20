import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { AxiosError } from 'axios';
import { App } from 'antd';
import { getErrorMessage } from '../../api/client';
import { AISettingsModal } from './AISettingsModal';

type AIContextValue = {
  openSettings: () => void;
  /**
   * Report an error from an AI endpoint: 409 (not configured) -> message.info + open AI settings;
   * anything else -> message.error with the backend detail (e.g. the provider's message on 502).
   */
  handleAIError: (error: unknown, fallback: string) => void;
};

const AIContext = createContext<AIContextValue | null>(null);

export function isAINotConfigured(error: unknown): boolean {
  return error instanceof AxiosError && error.response?.status === 409;
}

export function AIContextProvider({ children }: { children: ReactNode }) {
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);

  const openSettings = useCallback(() => setOpen(true), []);

  const handleAIError = useCallback(
    (error: unknown, fallback: string) => {
      if (isAINotConfigured(error)) {
        void message.info(getErrorMessage(error, 'AI is not configured. Add an API key in AI settings.'));
        setOpen(true);
        return;
      }
      void message.error(getErrorMessage(error, fallback));
    },
    [message],
  );

  const value = useMemo(() => ({ openSettings, handleAIError }), [openSettings, handleAIError]);

  return (
    <AIContext.Provider value={value}>
      {children}
      <AISettingsModal open={open} onClose={() => setOpen(false)} />
    </AIContext.Provider>
  );
}

export function useAI(): AIContextValue {
  const ctx = useContext(AIContext);
  if (ctx === null) throw new Error('useAI must be used inside <AIContextProvider>');
  return ctx;
}
