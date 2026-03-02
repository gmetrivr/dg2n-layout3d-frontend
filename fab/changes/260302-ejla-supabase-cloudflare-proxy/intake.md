# Intake: Supabase Cloudflare Proxy

**Change**: 260302-ejla-supabase-cloudflare-proxy
**Created**: 2026-03-02
**Status**: Draft

## Origin

> Update VITE_SUPABASE_URL to route through a Cloudflare Worker proxy instead of directly to supabase.co, so that users on Jio/JioFiber ISP (which blocks *.supabase.co) can access the app. The fix is an env config change: VITE_SUPABASE_URL should point to a custom proxy domain (e.g. https://api.yourdomain.com) instead of the direct Supabase URL. Update .env.example to document this with a comment explaining the proxy requirement. No code changes needed — supabaseClient.ts already reads from the env var correctly.

Initiated via `/fab-discuss` session. The user referenced this blog post for context:
https://www.metefy.com/blog/fix-supabase-down-on-jio-and-jiofiber-by-hiding-supabase-behind-your-own-domain-free-tier

Key decisions confirmed during discussion:
- **Only `.env.example` needs updating** — `supabaseClient.ts` already reads from `VITE_SUPABASE_URL` with no hardcoded Supabase URLs
- **No OAuth complexity** — the app uses `signInWithPassword` (email+password), not `signInWithOAuth`, so the Cloudflare Worker proxy alone fully fixes both auth and data access
- **Scripts are excluded** — Node.js scripts in `scripts/` run server-side and are not affected by Jio blocking
- **Storage URLs are automatically fixed** — `getPublicUrl` constructs URLs from `supabaseUrl`, so updating the env var fixes storage too

## Why

Jio and JioFiber (major Indian ISPs) silently block `*.supabase.co` at the DNS/network level. Any user on these ISPs experiences timeouts for all Supabase operations — login, database queries, and file storage — with no meaningful error message. This blocks a significant portion of potential Indian users from using the app entirely.

If unfixed: Indian users on Jio networks cannot log in or use any feature that touches Supabase (which is the entire app — auth, store saves, fixture IDs, ZIP storage).

The approach (Cloudflare Worker proxy) is correct because:
- The Supabase JS SDK routes all calls through the configured `supabaseUrl` — changing it to a proxy domain redirects all traffic without any code changes
- Cloudflare Workers are on the free tier and have near-zero latency overhead
- It's the canonical solution described in the referenced blog post and confirmed to work

## What Changes

### `.env.example`

Add a comment block explaining the proxy requirement. The current `.env.example` (inaccessible due to permissions, but known from `supabaseClient.ts`) likely has a bare `VITE_SUPABASE_URL=https://xxxx.supabase.co` entry.

The updated entry should look like:

```bash
# IMPORTANT: Do NOT point this directly at *.supabase.co
# Jio/JioFiber ISPs block supabase.co, causing timeouts for Indian users.
# Set this to your Cloudflare Worker proxy URL instead.
# See: https://www.metefy.com/blog/fix-supabase-down-on-jio-and-jiofiber-by-hiding-supabase-behind-your-own-domain-free-tier
VITE_SUPABASE_URL=https://api.yourdomain.com
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### No changes to source code

- `src/lib/supabaseClient.ts` — already correct; reads `VITE_SUPABASE_URL` from env, no hardcoded URLs
- `src/contexts/AuthContext.tsx` — uses `signInWithPassword`, no browser redirects to supabase.co
- `src/services/supabaseService.ts` — all DB/storage calls route through the configured client URL
- `scripts/` — server-side Node.js scripts, not affected by Jio blocking

## Affected Memory

- None — this is a documentation/config change with no spec-level behavioral change to the application logic itself

## Impact

- `/.env.example` — add proxy documentation comment
- Developers cloning the repo will see the explanation when setting up their environment
- Production deployments: operator must set `VITE_SUPABASE_URL` to the Cloudflare Worker proxy URL in their deployment environment (e.g. Vercel, Netlify)

## Open Questions

- None — all decisions were resolved during the `/fab-discuss` session

## Assumptions

| # | Grade | Decision | Rationale | Scores |
|---|-------|----------|-----------|--------|
| 1 | Certain | Only `.env.example` needs a code change | `supabaseClient.ts` reads from env var; confirmed by reading source. No hardcoded supabase.co URLs exist in src/ | S:95 R:95 A:95 D:95 |
| 2 | Certain | Auth is fully fixed by proxy — no OAuth workaround needed | App uses `signInWithPassword` only; confirmed by reading `AuthContext.tsx`. No `signInWithOAuth` anywhere | S:95 R:95 A:95 D:95 |
| 3 | Certain | Scripts in `scripts/` are out of scope | These run server-side (Node.js); Jio can only block browser traffic | S:90 R:90 A:90 D:90 |
| 4 | Confident | Storage public URLs are also fixed | `getPublicUrl` constructs URLs from `supabaseUrl` config; updating env var redirects storage URLs through proxy too | S:80 R:85 A:80 D:85 |
| 5 | Tentative | `.env.example` currently has a bare `VITE_SUPABASE_URL` entry | File was not readable due to permissions; inferred from `supabaseClient.ts` env var names | S:60 R:90 A:70 D:80 |

5 assumptions (3 certain, 1 confident, 1 tentative, 0 unresolved).
