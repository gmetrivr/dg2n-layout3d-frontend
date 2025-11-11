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

