import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { buildBasicToken, verifyToken } from '../services/proxyClient';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type AuthContextValue = {
  status: AuthStatus;
  authToken: string | null;
  username: string | null;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
};

const STORAGE_KEY = 'dg2n-layout3d-auth';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const readStoredCredentials = (): { token: string; username: string | null } | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as { token?: string; username?: string } | null;
    if (parsed?.token) {
      return { token: parsed.token, username: parsed.username ?? null };
    }
  } catch (error) {
    console.error('Failed to parse stored auth credentials', error);
  }

  return null;
};

const persistCredentials = (token: string, username: string | null) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      token,
      username,
    })
  );
};

const clearStoredCredentials = () => {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.removeItem(STORAGE_KEY);
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const resumeSession = async () => {
      const stored = readStoredCredentials();
      if (!stored) {
        setStatus('unauthenticated');
        return;
      }

      setStatus('loading');
      try {
        await verifyToken(stored.token);
        setAuthToken(stored.token);
        setUsername(stored.username ?? null);
        setStatus('authenticated');
      } catch (err) {
        console.warn('Stored credentials rejected during resume', err);
        clearStoredCredentials();
        setAuthToken(null);
        setUsername(null);
        setStatus('unauthenticated');
      }
    };

    void resumeSession();
  }, []);

  const logout = useCallback(() => {
    setAuthToken(null);
    setUsername(null);
    setStatus('unauthenticated');
    setError(null);
    clearStoredCredentials();
  }, []);

  const login = useCallback(async (user: string, password: string) => {
    const normalizedUser = user.trim();
    if (!normalizedUser || !password) {
      setError('Username and password are required');
      throw new Error('Missing credentials');
    }

    setStatus('loading');
    setError(null);

    const token = buildBasicToken(normalizedUser, password);

    try {
      await verifyToken(token);
      setAuthToken(token);
      setUsername(normalizedUser);
      setStatus('authenticated');
      persistCredentials(token, normalizedUser);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to authenticate';
      setStatus('unauthenticated');
      setError(message || 'Unauthorized');
      clearStoredCredentials();
      throw err;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      authToken,
      username,
      error,
      login,
      logout,
      clearError,
    }),
    [status, authToken, username, error, login, logout, clearError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};