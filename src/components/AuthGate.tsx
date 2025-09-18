import { useState } from 'react';
import type { FormEvent } from 'react';

import { Button } from '@/shadcn/components/ui/button';
import { useAuth } from '../contexts/AuthContext';

export const AuthGate = ({ children }: { children: React.ReactNode }) => {
  const { status, login, error, clearError } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setLocalError(null);
    clearError();

    try {
      await login(username, password);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to authenticate';
      setLocalError(message || 'Unauthorized');
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="text-lg font-medium text-foreground">Checking credentials…</div>
          <div className="text-sm text-muted-foreground">Hang tight while we verify access.</div>
        </div>
      </div>
    );
  }

  if (status !== 'authenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 shadow-lg">
          <h1 className="text-xl font-semibold text-foreground mb-6">Sign in to dg2n Layout3D</h1>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label htmlFor="username" className="text-sm font-medium text-foreground">
                Username
              </label>
              <input
                id="username"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-foreground">
                Password
              </label>
              <input
                id="password"
                type="password"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {(localError || error) && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {localError || error}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
