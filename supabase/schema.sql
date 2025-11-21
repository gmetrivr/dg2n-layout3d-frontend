-- Create a table to track saved store ZIPs
create table if not exists public.store_saves (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  store_id text not null,
  store_name text not null,
  job_id text null,
  zip_path text not null,
  zip_size bigint null,
  entity text null
);

-- Note: Use the Supabase Dashboard to create a Storage bucket.
-- Recommended bucket name: 'store-archives' (public)
-- Then add a policy to allow uploads with anon key if appropriate, e.g.:
--   Storage > store-archives > Policies > New policy:
--   name: allow_public_uploads
--   definition:
--     (for objects) using (true) with check (true)
--   CAUTION: This allows public writes; prefer authenticated writes in production.

-- Create a table to track Store Fixture IDs (SFI) with full history
create table if not exists public.store_fixture_ids (
  id uuid primary key default gen_random_uuid(),
  fixture_id text not null,
  store_id text not null,
  fixture_type text not null,
  brand text not null,
  floor_index numeric not null default 0,
  pos_x numeric not null,
  pos_y numeric not null,
  pos_z numeric not null,
  created_at timestamp with time zone not null, -- First time fixture_id was created (never changes)
  updated_at timestamp with time zone not null default now() -- When this entry was created
);

-- Create indexes for efficient queries
create index if not exists idx_sfi_store_fixture on public.store_fixture_ids (store_id, fixture_id);
create index if not exists idx_sfi_store_brand on public.store_fixture_ids (store_id, brand);
create index if not exists idx_sfi_brand_type on public.store_fixture_ids (brand, fixture_type);
create index if not exists idx_sfi_updated_at on public.store_fixture_ids (updated_at desc);
create index if not exists idx_sfi_store_fixture_updated on public.store_fixture_ids (store_id, fixture_id, updated_at desc);
create index if not exists idx_sfi_store_floor on public.store_fixture_ids (store_id, floor_index);

-- NO unique constraint - allows multiple entries per fixture for history tracking

