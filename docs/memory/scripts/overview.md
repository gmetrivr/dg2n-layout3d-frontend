# Scripts

## Overview

`scripts/` contains 4 Node.js ESM (`.mjs`) batch processing scripts for offline data operations: bulk space tracking analysis, make-live deployment, and brand extraction. All scripts use `dotenv` for environment configuration and the Supabase client for data access.

## Requirements

- All scripts MUST support `--env` flag to select environment file (`.env.local`, `.env.local.rc`, `.env.local.prod`).
- Scripts that read stores MUST use Supabase to fetch `store_saves` records.
- Scripts that process ZIPs MUST use JSZip to extract files from `store-archives` bucket.
- Output scripts MUST write to a configurable `--output` directory.

## Design Decisions

### Script Inventory

| Script | Purpose |
|---|---|
| `batch-space-tracker.mjs` | Process multiple store ZIPs, extract location CSV, run space tracker analysis, generate per-store reports |
| `batch-job-space-tracker.mjs` | Similar to above but operates on job output rather than saved stores [INFERRED] |
| `batch-make-live.mjs` | Deploy multiple stores to live status in bulk (calls Stockflow `processStore3DZip` or similar) [INFERRED] |
| `extract-brands-master.mjs` | Extract brand metadata from store ZIPs and compile a master brand list |

### Common CLI Pattern

All scripts follow this pattern:

```js
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import JSZip from 'jszip';

// Load env: --env flag or default to .env.local
const envFile = args['--env'] || '.env.local';
dotenv.config({ path: envFile });

// Auth with Supabase service role key [INFERRED]
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Process: fetch stores → download ZIPs → extract → analyze → write output
```

### `batch-space-tracker.mjs` Flow

1. Accept `--csv` input with list of store IDs (or fetch all from Supabase)
2. For each store: download ZIP from `store-archives` bucket
3. Extract location CSV from ZIP
4. Run `spaceTrackerUtils` analysis
5. Write per-store report to `--output` directory

## Changelog

| Date | Change |
|------|--------|
| 2026-03-03 | Generated from code analysis |
