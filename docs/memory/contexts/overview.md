# Contexts

## Overview

`src/contexts/` provides three React Context providers that are composed at the app root in `App.tsx`: `AuthProvider`, `StoreProvider`, and `ThemeProvider`. All three are required; wrapping order is `Auth > Store > Theme`.

## Requirements

- `AuthProvider` MUST bootstrap the Supabase session on mount and subscribe to `onAuthStateChange` for real-time session updates.
- `useAuth()` MUST throw if called outside `AuthProvider`.
- `AuthProvider` MUST resolve `username` from `user.email` first, falling back to `user.user_metadata.full_name`.
- `AuthStatus` MUST be `'loading'` during session bootstrap, never `'authenticated'` or `'unauthenticated'` before the async check completes.

## Design Decisions

### Provider Hierarchy

```tsx
<AuthProvider>       // outermost — auth must be resolved before anything else
  <StoreProvider>    // store data depends on auth session
    <ThemeProvider>  // pure UI, no auth dependency
      ...
    </ThemeProvider>
  </StoreProvider>
</AuthProvider>
```

### `AuthContext` Shape

```ts
type AuthContextValue = {
  status: 'loading' | 'authenticated' | 'unauthenticated';
  user: User | null;
  username: string | null;   // email or full_name metadata
  error: string | null;
  login(email, password): Promise<void>;
  logout(): Promise<void>;
  clearError(): void;
};
```

Key behaviours:
- Uses `useMemo` to stabilize the context value object (avoids unnecessary re-renders).
- `login()` normalizes email via `.trim()` and rejects empty credentials synchronously.
- `logout()` sets status to `'loading'` then `'unauthenticated'` on success; reverts to `'authenticated'` if sign-out errors.
- The `useEffect` cleanup sets `active = false` to prevent state updates after unmount, and calls `subscription.unsubscribe()`.

### `ThemeContext` (1,591 LOC)

Large context — likely manages light/dark theme toggling and persists preference. [INFERRED] Exposed as `useTheme()`.

### `StoreContext` (970 LOC)

Manages store-level shared state. [INFERRED] Exposed as `useStore()`.

## Changelog

| Date | Change |
|------|--------|
| 2026-03-03 | Generated from code analysis |
