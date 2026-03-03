# Environment Variables

## Overview

The app uses Vite's `import.meta.env` for environment configuration. Three `.env.local.*` files cover development, RC, and production environments. `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are required at startup and will throw immediately if missing.

## Requirements

- `VITE_SUPABASE_URL` MUST be set; absence throws `Error('Missing VITE_SUPABASE_URL environment variable.')` at module load.
- `VITE_SUPABASE_ANON_KEY` MUST be set; absence throws similarly.
- `VITE_SUPABASE_BUCKET` is optional; defaults to `store-archives` if unset.
- `VITE_API_URL` is optional; used by `supabaseService.ts` as a base URL override (defaults to `""`).

## Design Decisions

### Variable Reference

| Variable | Required | Default | Used In | Description |
|---|---|---|---|---|
| `VITE_SUPABASE_URL` | Yes | — | `src/lib/supabaseClient.ts` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | — | `src/lib/supabaseClient.ts` | Supabase anon/public key |
| `VITE_SUPABASE_BUCKET` | No | `store-archives` | `src/services/supabaseService.ts` | Storage bucket name |
| `VITE_API_URL` | No | `""` | `src/services/supabaseService.ts` | API base URL override |

### Environment Files

| File | Purpose |
|---|---|
| `.env.local` | Local development (gitignored) |
| `.env.local.rc` | RC / staging environment |
| `.env.local.prod` | Production environment |
| `.env.example` | Template (committed to repo) |

Vite loads `.env.local` by default in dev; RC/prod files must be copied or specified explicitly.

### Build Mode Detection

`api.ts` uses `import.meta.env.MODE` to select backend URL:

```ts
MODE === "production" | "rc" | "staging"  → absolute URL
MODE === "development" (default)           → "" (Vite proxy)
```

Custom modes (`rc`, `staging`) require `--mode rc` or `--mode staging` flag when running `vite build`.

### Scripts (Node.js)

Batch scripts in `scripts/` use `dotenv` (not Vite env) and load via `--env` CLI flag:

```
node scripts/batch-space-tracker.mjs --env .env.local
```

Script env vars use `SUPABASE_URL` / `SUPABASE_KEY` (without `VITE_` prefix) since they run in Node, not the browser. [INFERRED]

## Changelog

| Date | Change |
|------|--------|
| 2026-03-03 | Generated from code analysis |
