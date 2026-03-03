# Lib

## Overview

`src/lib/` contains a single file: `supabaseClient.ts`, which creates and exports the shared Supabase client instance used throughout the application. It is a module-level singleton — client creation happens once at import time.

## Requirements

- `VITE_SUPABASE_URL` MUST be set; the module throws `Error('Missing VITE_SUPABASE_URL environment variable.')` at startup if absent.
- `VITE_SUPABASE_ANON_KEY` MUST be set; similarly throws if absent.
- The client MUST be configured with `autoRefreshToken: true`, `persistSession: true`, and `detectSessionInUrl: true`.

## Design Decisions

```ts
// src/lib/supabaseClient.ts
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,    // keeps sessions alive silently
    persistSession: true,      // survives page refreshes (localStorage)
    detectSessionInUrl: true,  // handles OAuth/magic link callbacks
  },
});
```

- Fail-fast validation at module load ensures misconfigured deployments are caught immediately rather than at runtime during the first API call.
- The single exported `supabase` constant is imported directly by `AuthContext`, `supabaseService`, and `api.ts`.

## Changelog

| Date | Change |
|------|--------|
| 2026-03-03 | Generated from code analysis |
