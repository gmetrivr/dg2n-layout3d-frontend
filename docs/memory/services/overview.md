# Services

## Overview

`src/services/` contains 7 modules that handle all backend communication, data persistence, fixture ID management, and output generation (PDF, QR). The two largest — `api.ts` (~21.6k LOC) and `supabaseService.ts` (~18k LOC) — are the primary data layer.

## Requirements

- All requests to the Fastify backend MUST include a Supabase Bearer token in the `Authorization` header.
- `api.ts` MUST handle both old and new API response formats for `getJobStatus` (new: `result.data.job`, old: `result` directly). [INFERRED]
- `fixtureIdAssignment` MUST be idempotent: re-running on the same store MUST NOT generate duplicate fixture IDs.
- `supabaseService` MUST use the `DEFAULT_BUCKET` (`store-archives`) unless `VITE_SUPABASE_BUCKET` overrides it.

## Design Decisions

### Service Inventory

| Service | LOC | Responsibility |
|---|---|---|
| `api.ts` | ~21,592 | All Fastify + Stockflow REST API calls; types for jobs, brands, fixtures, tolerances |
| `supabaseService.ts` | ~18,046 | `useSupabaseService()` hook; store save/load; fixture ID tracking via Supabase |
| `fixtureIdAssignment.ts` | ~10,152 | Assign/persist dg2n fixture IDs for new and updated store fixtures |
| `spaceTrackerUtils.ts` | ~10,369 | (in utils, large enough to note) Space occupancy analysis from CSV data |
| `layoutPdfService.ts` | — | Generate PDF reports for store layouts |
| `qrCodeService.ts` | — | QR code generation for fixture labels |
| `qrDownloadService.ts` | — | Batch download QR codes as ZIP |
| `fixtureTypeMapping.ts` | — | Map DWG block names → fixture type strings (e.g. `RTL-4W` → `4-WAY`) |

### API Base URL Resolution (`api.ts`)

```ts
const FASTIFY_API_BASE_URL =
  MODE === "production"  ? 'https://dg2n-layout3d-backend.rc.dg2n.com'
  : MODE === "rc"        ? 'https://dg2n-layout3d-backend.rc.dg2n.com'
  : "";  // dev: empty string → Vite proxy handles routing
```

In development, relative URLs hit the Vite dev server proxy (routes `/(api|config)` to `localhost:4260`).

### Fastify Backend Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/jobs/upload` | Upload DWG file(s), returns `job_id` |
| GET | `/api/jobs/{jobId}` | Get job detail + progress |
| GET | `/api/jobs?allUsers=true` | List all jobs (paginated) |
| GET | `/api/rhino/download/{jobId}/{fileName}` | Download single output file |
| GET | `/api/rhino/jobs/{jobId}/download-zip` | Download all job outputs as ZIP |
| GET | `/api/config/tolerances/{pipeline_version}` | Get tolerance defaults |
| GET | `/api/brands?pipeline_version={v}` | Get brand list with categories |
| GET | `/api/brands/migrations?pipeline_version={v}` | Get brand migration map |
| POST | `/api/brands/migrate` | Migrate brand names |
| GET | `/api/fixtures/blocks?pipeline_version={v}` | Get fixture block definitions |
| GET | `/api/fixtures/types?pipeline_version={v}` | Get fixture type list |
| GET | `/api/fixtures/type/{type}/url?pipeline_version={v}` | Get GLB URL for fixture type |
| GET | `/api/fixtures/type/{type}/block-name?pipeline_version={v}` | Get block name for type |
| GET | `/api/fixtures/type/{type}/variants?pipeline_version={v}` | Get variants for fixture type |

### Stockflow Backend Endpoint

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/tooling/processStore3DZip` | Submit ZIP for 3D processing in Stockflow |

In dev, this goes through the Vite proxy to `https://stockflow-core.rc.dg2n.com`.

### `JobStatus` / `JobDetail` Types

```ts
interface JobStatus {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  files_processed: number;
  total_files: number;
  output_dir?: string;
  error_message?: string;
  config?: Record<string, any>;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}
```

`JobDetail` extends this with `inputFiles`, `outputFiles`, `progress` (per-script), and pagination metadata.

## Changelog

| Date | Change |
|------|--------|
| 2026-03-03 | Generated from code analysis |
