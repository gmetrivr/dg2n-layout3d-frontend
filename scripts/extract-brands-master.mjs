#!/usr/bin/env node

/**
 * Extract a deduplicated brands master CSV from stores.
 *
 * Usage:
 *   node scripts/extract-brands-master.mjs [mode]
 *
 * Modes:
 *   latest-live  (default) — only the most recent live record per store
 *   all-live     — every record with status='live'
 *   all          — every record regardless of status
 *
 * Reads Supabase credentials from .env.local.prod, queries stores,
 * downloads each ZIP, extracts brands from location-master.csv, and
 * writes a deduplicated master CSV to output/brands-master.csv.
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import JSZip from 'jszip';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: '.env.local.prod' });

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const BUCKET = process.env.VITE_SUPABASE_BUCKET || 'store-archives';
const PAGE_SIZE = 1000;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const VALID_MODES = ['latest-live', 'all-live', 'all'];
const mode = process.argv[2] || 'latest-live';

if (!VALID_MODES.includes(mode)) {
  console.error(`Invalid mode "${mode}". Valid modes: ${VALID_MODES.join(', ')}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Paginated fetch from store_saves with an optional status filter. */
async function fetchStores(statusFilter) {
  const allRecords = [];
  let offset = 0;

  while (true) {
    let query = supabase
      .from('store_saves')
      .select('id, store_id, store_name, zip_path, status, live_at')
      .order('live_at', { ascending: false });

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error('Supabase query failed:', error.message);
      process.exit(1);
    }

    if (!data || data.length === 0) break;

    allRecords.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return allRecords;
}

/** Deduplicate records by store_id, keeping the first (latest) per store. */
function dedupeByStoreId(records) {
  const seen = new Set();
  const deduped = [];
  for (const record of records) {
    if (!seen.has(record.store_id)) {
      seen.add(record.store_id);
      deduped.push(record);
    }
  }
  return deduped;
}

/** Fetch stores according to the chosen mode. */
async function fetchStoresForMode(mode) {
  switch (mode) {
    case 'latest-live': {
      const records = await fetchStores('live');
      return dedupeByStoreId(records);
    }
    case 'all-live':
      return fetchStores('live');
    case 'all':
      return fetchStores(null);
  }
}

/** Download a ZIP and extract brand names from location-master.csv. */
async function extractBrandsFromStore(record) {
  const { data: zipBlob, error: dlError } = await supabase.storage
    .from(BUCKET)
    .download(record.zip_path);

  if (dlError || !zipBlob) {
    console.warn(`  [SKIP] Failed to download ZIP for store_id=${record.store_id}: ${dlError?.message || 'no data'}`);
    return [];
  }

  const zip = await JSZip.loadAsync(await zipBlob.arrayBuffer());
  const locationCsvFile = zip.file(/location[-_]master\.csv/i)[0];
  if (!locationCsvFile) {
    console.warn(`  [SKIP] No location-master.csv in ZIP for store_id=${record.store_id}`);
    return [];
  }

  const csvText = await locationCsvFile.async('text');
  const lines = csvText.split(/\r?\n/);

  const headers = lines[0].split(',').map(h => h.trim());
  const brandColumnIndex = headers.findIndex(h => h.toLowerCase() === 'brand');
  if (brandColumnIndex === -1) {
    console.warn(`  [SKIP] No Brand column in CSV for store_id=${record.store_id}`);
    return [];
  }

  const brands = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = line.split(',');
    if (values.length > brandColumnIndex) {
      const brand = values[brandColumnIndex].trim();
      if (brand) brands.push(brand);
    }
  }

  return brands;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // 1. Fetch stores based on mode
  console.log(`Mode: ${mode}`);
  console.log('Fetching store records from Supabase …');
  const stores = await fetchStoresForMode(mode);

  if (stores.length === 0) {
    console.log('No stores found.');
    process.exit(0);
  }

  console.log(`Found ${stores.length} store record(s) to process.\n`);

  // 2. Extract brands from each store
  // Map: brandLowerCase -> { original: string, storeIds: Set<string> }
  const brandMap = new Map();
  let processed = 0;
  let skipped = 0;

  for (const store of stores) {
    processed++;
    console.log(`[${processed}/${stores.length}] Processing store_id=${store.store_id} ("${store.store_name}") …`);

    try {
      const brands = await extractBrandsFromStore(store);
      if (brands.length === 0) {
        skipped++;
        continue;
      }

      for (const brand of brands) {
        const key = brand.toLowerCase();
        if (!brandMap.has(key)) {
          brandMap.set(key, { original: brand, storeIds: new Set() });
        }
        brandMap.get(key).storeIds.add(store.store_id);
      }

      console.log(`  Found ${brands.length} brand entries`);
    } catch (err) {
      console.warn(`  [SKIP] Error processing store_id=${store.store_id}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`\nProcessed ${processed} stores (${skipped} skipped).`);
  console.log(`Found ${brandMap.size} unique brand(s).\n`);

  if (brandMap.size === 0) {
    console.log('No brands found across any store.');
    process.exit(0);
  }

  // 3. Build and write master CSV
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const outputDir = join(__dirname, '..', 'output');
  mkdirSync(outputDir, { recursive: true });

  const outputPath = join(outputDir, `brands-master-${mode}.csv`);

  const sortedBrands = [...brandMap.values()].sort((a, b) =>
    a.original.toLowerCase().localeCompare(b.original.toLowerCase())
  );

  const csvLines = ['Brand,StoreIDs,StoreCount'];
  for (const entry of sortedBrands) {
    const storeIdsList = [...entry.storeIds].sort().join(',');
    // Quote fields that may contain commas
    csvLines.push(`"${entry.original}","${storeIdsList}",${entry.storeIds.size}`);
  }

  writeFileSync(outputPath, csvLines.join('\n'), 'utf-8');
  console.log(`Master CSV written to ${outputPath}`);
  console.log(`Total unique brands: ${brandMap.size}`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
