import { StrictMode, useMemo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { App as AntApp, ConfigProvider } from 'antd';
import enGB from 'antd/locale/en_GB';
import 'dayjs/locale/en-gb';
import { AuthProvider } from './auth/AuthContext';
import { App } from './App';
import { buildAntdTheme } from './theme/antdTheme';
import { ThemeModeProvider, useThemeMode } from './theme/ThemeModeContext';
import { ROUTER_BASENAME } from './utils/basePath';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        // Don't retry client errors (401/403/404...)
        if (error instanceof AxiosError && error.response && error.response.status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

/** antd ConfigProvider following the resolved light/dark mode. */
function ThemedConfig({ children }: { children: ReactNode }) {
  const { resolved } = useThemeMode();
  const themeConfig = useMemo(() => buildAntdTheme(resolved === 'dark'), [resolved]);
  return (
    <ConfigProvider theme={themeConfig} locale={enGB}>
      {children}
    </ConfigProvider>
  );
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

createRoot(rootElement).render(
  <StrictMode>
    <ThemeModeProvider>
      <ThemedConfig>
        <AntApp>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter
              basename={ROUTER_BASENAME}
              future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
            >
              <AuthProvider>
                <App />
              </AuthProvider>
            </BrowserRouter>
          </QueryClientProvider>
        </AntApp>
      </ThemedConfig>
    </ThemeModeProvider>
  </StrictMode>,
);
