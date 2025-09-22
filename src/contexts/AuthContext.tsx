import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js';

import { supabase } from '../lib/supabaseClient';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type AuthContextValue = {
  status: AuthStatus;
  user: User | null;
  username: string | null;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const resolveUsername = (user: User | null) => {
  if (!user) return null;
  if (typeof user.email === 'string' && user.email.length > 0) {
    return user.email;
  }

  const { full_name: fullName } = (user.user_metadata ?? {}) as { full_name?: string };
  return fullName ?? null;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const bootstrapSession = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!active) return;

      if (sessionError) {
        console.error('Failed to restore Supabase session', sessionError);
        setError(sessionError.message);
        setUser(null);
        setStatus('unauthenticated');
        return;
      }

      setUser(data.session?.user ?? null);
      setStatus(data.session?.user ? 'authenticated' : 'unauthenticated');
    };

    void bootstrapSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      setUser(session?.user ?? null);
      setStatus(session?.user ? 'authenticated' : 'unauthenticated');
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) {
      const message = 'Email and password are required';
      setError(message);
      setStatus('unauthenticated');
      throw new Error(message);
    }

    setStatus('loading');
    setError(null);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (signInError) {
      setError(signInError.message ?? 'Unable to authenticate');
      setStatus('unauthenticated');
      throw signInError;
    }

    setUser(data.user ?? null);
    setStatus(data.user ? 'authenticated' : 'unauthenticated');
  }, []);

  const logout = useCallback(async () => {
    setStatus('loading');
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message ?? 'Unable to log out');
      setStatus('authenticated');
      throw signOutError;
    }

    setUser(null);
    setStatus('unauthenticated');
    setError(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      username: resolveUsername(user),
      error,
      login,
      logout,
      clearError,
    }),
    [status, user, error, login, logout, clearError]
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
