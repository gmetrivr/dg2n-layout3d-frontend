# Auth + API Request Pattern

## Overview

All authenticated API calls follow the same pattern: get the current Supabase session, extract the access token, and pass it as a Bearer token in the `Authorization` header. This pattern is used across `api.ts`, `supabaseService.ts`, and directly in some components.

## Requirements

- Every request to the Fastify backend MUST include `Authorization: Bearer {access_token}`.
- The access token MUST be freshly fetched from `supabase.auth.getSession()` per request (not cached).
- If `session` is null, the request MUST either be aborted or called without auth (for public endpoints only). [INFERRED]

## Design Decisions

### Standard Request Pattern

```ts
// 1. Get current session
const { data: { session } } = await supabase.auth.getSession();
const token = session?.access_token;

// 2. Make authenticated request
const response = await fetch(`${FASTIFY_API_BASE_URL}/api/some/endpoint`, {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
});

// 3. Parse response
if (!response.ok) throw new Error(`HTTP ${response.status}`);
const data = await response.json();
```

### Why `getSession()` per request?

`supabase` is configured with `autoRefreshToken: true`, so the client maintains a fresh token. Calling `getSession()` returns the current (potentially just-refreshed) token without a network round-trip in most cases.

### File Upload Pattern

```ts
const formData = new FormData();
formData.append('file', file);
// Note: Do NOT set Content-Type header — browser sets multipart boundary automatically

const response = await fetch(`${FASTIFY_API_BASE_URL}/api/jobs/upload`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: formData,
});
```

### `VITE_API_URL` Fallback (supabaseService)

`supabaseService.ts` uses `import.meta.env.VITE_API_URL || ''` as an additional base URL override for its internal API calls, providing a third configuration point beyond `FASTIFY_API_BASE_URL` in `api.ts`. [INFERRED to be for the Supabase Edge Functions or similar]

### Dev vs Production Routing

In development, `FASTIFY_API_BASE_URL` is `""` (empty string), so requests go to relative paths like `/api/jobs/upload` — which are intercepted by the Vite dev server proxy and forwarded to `http://localhost:4260`.

In production/RC builds, the absolute URL `https://dg2n-layout3d-backend.rc.dg2n.com` is used directly, bypassing any proxy.

## Changelog

| Date | Change |
|------|--------|
| 2026-03-03 | Generated from code analysis |
