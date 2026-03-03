# Supabase Schema

## Overview

The app uses Supabase for authentication, store metadata persistence, fixture ID tracking, and file storage. Two database tables and one storage bucket are in use.

## Requirements

- `store_saves` MUST store store metadata and a reference to the ZIP archive path in `store-archives`.
- `store_fixture_ids` MUST track dg2n fixture ID assignments so IDs are stable across re-saves.
- The `store-archives` bucket MUST contain store ZIP files (GLB + CSV); the bucket name is configurable via `VITE_SUPABASE_BUCKET` (default: `store-archives`).
- All database reads/writes MUST use the authenticated Supabase client (Bearer session token).

## Design Decisions

### Tables

#### `store_saves`

Stores metadata about each saved store configuration.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | Store identifier |
| `user_id` | uuid | Supabase auth user ID |
| `store_name` | text | Human-readable store name [INFERRED] |
| `zip_path` | text | Path in `store-archives` bucket |
| `created_at` | timestamp | Auto-set by Supabase |
| `updated_at` | timestamp | Updated on each save [INFERRED] |
| `pipeline_version` | text | Version string for brand/fixture compatibility [INFERRED] |

#### `store_fixture_ids`

Tracks which dg2n fixture IDs have been assigned to fixtures within a store.

| Column | Type | Notes |
|---|---|---|
| `store_id` | uuid (FK → store_saves) | Parent store |
| `fixture_uid` | text | Internal UID (block name + position hash) |
| `dg2n_fixture_id` | text | Assigned dg2n ID |
| `created_at` | timestamp | Assignment timestamp |

### Storage Bucket: `store-archives`

- Bucket name defaults to `store-archives`; override with `VITE_SUPABASE_BUCKET`.
- ZIP files contain: one or more `.glb` files (3D geometry) + location CSV(s).
- Accessed via `supabaseService.ts` using the Supabase JS storage API with the user's session token.

### Authentication

- Email + password sign-in via `supabase.auth.signInWithPassword()`.
- Session auto-refreshed; persisted in localStorage.
- `detectSessionInUrl: true` enables magic link / OAuth flows if configured later.
- Access token extracted per-request: `supabase.auth.getSession()` → `session.access_token`.

## Changelog

| Date | Change |
|------|--------|
| 2026-03-03 | Generated from code analysis |
