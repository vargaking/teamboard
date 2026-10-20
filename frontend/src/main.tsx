import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { App as AntApp, ConfigProvider } from 'antd';
import enGB from 'antd/locale/en_GB';
import 'dayjs/locale/en-gb';
import { AuthProvider } from './auth/AuthContext';
import { App } from './App';
import { theme } from './theme';
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

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

createRoot(rootElement).render(
  <StrictMode>
    <ConfigProvider theme={theme} locale={enGB}>
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter basename={ROUTER_BASENAME} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  </StrictMode>,
);
