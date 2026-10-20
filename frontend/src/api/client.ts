import axios, { AxiosError } from 'axios';

export const TOKEN_KEY = 'teamboard_token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore storage errors
  }
}

export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (error instanceof AxiosError && error.response?.status === 401) {
      // A failed login attempt is also a 401: let the login form show the error instead.
      const isLoginRequest = error.config?.url?.endsWith('/auth/login') ?? false;
      if (!isLoginRequest) {
        clearToken();
        if (window.location.pathname !== '/login') {
          window.location.assign('/login');
        }
      }
    }
    return Promise.reject(error);
  },
);

type ValidationIssue = { msg?: unknown; loc?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Extract a human-readable message from an API error (FastAPI `{"detail": ...}`). */
export function getErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error instanceof AxiosError) {
    const data: unknown = error.response?.data;
    if (isRecord(data)) {
      const detail = data.detail;
      if (typeof detail === 'string') return detail;
      if (Array.isArray(detail) && detail.length > 0) {
        const first: unknown = detail[0];
        if (isRecord(first)) {
          const issue = first as ValidationIssue;
          if (typeof issue.msg === 'string') return issue.msg;
        }
      }
    }
    if (!error.response) return 'Cannot reach the server';
    return error.message || fallback;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}
