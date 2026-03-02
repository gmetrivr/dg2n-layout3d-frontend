# Spec: Supabase Cloudflare Proxy

**Change**: 260302-ejla-supabase-cloudflare-proxy
**Created**: 2026-03-02
**Affected memory**: none

## Non-Goals

- Setting up the Cloudflare Worker itself — that is infrastructure outside this repo
- Modifying any source code — `src/lib/supabaseClient.ts` is already correct
- Modifying scripts in `scripts/` — they run server-side and are unaffected by ISP blocking
- Implementing OAuth changes — the app uses email/password auth only

## Environment Configuration: Proxy Documentation

### Requirement: VITE_SUPABASE_URL must be documented as a proxy URL

`.env.example` SHALL document `VITE_SUPABASE_URL` with a comment block that:
1. Warns that the value MUST NOT point directly at `*.supabase.co`
2. Explains why (Jio/JioFiber ISPs block supabase.co, causing silent timeouts for Indian users)
3. States what value to use instead (a Cloudflare Worker proxy URL on your own domain)
4. Links to the reference guide for setting up the proxy

#### Scenario: Developer clones repo and sets up environment

- **GIVEN** a developer clones this repo for the first time
- **WHEN** they copy `.env.example` to `.env.local` to fill in their credentials
- **THEN** they see a clear comment above `VITE_SUPABASE_URL` explaining the proxy requirement
- **AND** the example value `https://api.yourdomain.com` makes the expected format unambiguous

#### Scenario: Developer on Jio uses direct supabase.co URL

- **GIVEN** a developer sets `VITE_SUPABASE_URL=https://xxxx.supabase.co` directly
- **WHEN** the app is accessed from a Jio/JioFiber connection
- **THEN** all Supabase operations (auth, DB queries, storage) time out silently
- **AND** the comment in `.env.example` exists to guide them toward the proxy fix

### Requirement: VITE_SUPABASE_ANON_KEY must remain unchanged

`VITE_SUPABASE_ANON_KEY` SHALL NOT be changed — the anon key stays the same whether traffic is proxied or direct.

#### Scenario: Anon key with proxy URL

- **GIVEN** `VITE_SUPABASE_URL` is set to a Cloudflare Worker proxy URL
- **WHEN** the Supabase client initialises with the unchanged anon key
- **THEN** the Cloudflare Worker forwards requests to the real Supabase with the original key intact

## Design Decisions

1. **Comment placement**: Comment block placed immediately above `VITE_SUPABASE_URL`, not at the top of the file
   - *Why*: Scoped comments are more useful than a distant preamble — the warning is visible exactly where it matters
   - *Rejected*: File-level header comment — easy to overlook when copy-pasting the env var

2. **Proxy URL example value**: Use `https://api.yourdomain.com` as the example
   - *Why*: Generic enough to not mislead, specific enough to show the subdomain pattern
   - *Rejected*: Keeping `https://xxxx.supabase.co` — this would demonstrate the wrong pattern

## Assumptions

| # | Grade | Decision | Rationale | Scores |
|---|-------|----------|-----------|--------|
| 1 | Certain | Only `.env.example` needs updating | `supabaseClient.ts` reads from env var; confirmed from source — no hardcoded supabase.co URLs | S:95 R:95 A:95 D:95 |
| 2 | Certain | Auth is fully fixed by proxy alone | App uses `signInWithPassword`; confirmed from `AuthContext.tsx` — no `signInWithOAuth` anywhere | S:95 R:95 A:95 D:95 |
| 3 | Certain | Scripts are out of scope | Run server-side (Node.js); Jio can only block browser traffic | S:90 R:90 A:90 D:90 |
| 4 | Confident | Storage public URLs also fixed | `getPublicUrl` constructs URLs from configured `supabaseUrl`; SDK routes all calls through proxy | S:80 R:85 A:80 D:85 |
| 5 | Tentative | `.env.example` has a bare VITE_SUPABASE_URL entry to update | File not readable due to permissions; inferred from `supabaseClient.ts` env var names | S:60 R:90 A:70 D:80 |

5 assumptions (3 certain, 1 confident, 1 tentative, 0 unresolved).
