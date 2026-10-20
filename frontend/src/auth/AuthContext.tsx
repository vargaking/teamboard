import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as authApi from '../api/auth';
import { clearToken, getToken, setToken } from '../api/client';
import type { Token, User } from '../api/types';

export type AuthContextValue = {
  user: User | null;
  /** true while the initial GET /auth/me is in flight */
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  /** Adopt a token issued elsewhere (e.g. accepting an invite) exactly like a login. */
  loginWithToken: (token: Token) => User;
  logout: () => void;
  setUser: (user: User) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(() => getToken() !== null);

  useEffect(() => {
    if (getToken() === null) return;
    let cancelled = false;
    authApi
      .getMe()
      .then((me) => {
        if (!cancelled) setUserState(me);
      })
      .catch(() => {
        // 401 is handled by the axios interceptor; anything else: drop the session.
        if (!cancelled) {
          clearToken();
          setUserState(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loginWithToken = useCallback(
    (token: Token): User => {
      setToken(token.access_token);
      queryClient.clear();
      setUserState(token.user);
      return token.user;
    },
    [queryClient],
  );

  const login = useCallback(
    async (email: string, password: string): Promise<User> => loginWithToken(await authApi.login({ email, password })),
    [loginWithToken],
  );

  const logout = useCallback(() => {
    clearToken();
    queryClient.clear();
    setUserState(null);
  }, [queryClient]);

  const setUser = useCallback((next: User) => setUserState(next), []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, loginWithToken, logout, setUser }),
    [user, loading, login, loginWithToken, logout, setUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}

/** Like useAuth but asserts a logged-in user (use only below <RequireAuth>). */
export function useCurrentUser(): User {
  const { user } = useAuth();
  if (user === null) {
    throw new Error('useCurrentUser called without an authenticated user');
  }
  return user;
}
