# Backend API Endpoints

## Overview

The app communicates with two backends: a **Fastify backend** (jobs, brands, fixtures, tolerances, file downloads) and the **Stockflow backend** (store 3D ZIP processing). In development, both are proxied through the Vite dev server. In production/RC, the Fastify backend URL is set explicitly; the Stockflow backend is always `https://stockflow-core.rc.dg2n.com`.

## Requirements

- All Fastify backend calls MUST include `Authorization: Bearer {supabase_access_token}` header.
- The Stockflow endpoint `/api/tooling/processStore3DZip` MUST receive a multipart/form-data ZIP payload. [INFERRED]
- `pipeline_version` query parameter MUST be included on all brand and fixture endpoints.
- File download endpoints MUST stream binary responses (GLB, ZIP).

## Design Decisions

### Base URL Resolution

```ts
const FASTIFY_API_BASE_URL =
  MODE === "production" || MODE === "rc" || MODE === "staging"
    ? 'https://dg2n-layout3d-backend.rc.dg2n.com'
    : "";  // empty → Vite proxy at /api and /config
```

### Fastify Backend — Full Endpoint Reference

#### Jobs

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/jobs/upload` | Upload DWG file(s). Returns `{ job_id, message, files_uploaded, total_files }` |
| `GET` | `/api/jobs/{jobId}` | Get full job detail including per-script progress |
| `GET` | `/api/jobs?allUsers=true` | Paginated job list for all users |
| `GET` | `/api/rhino/download/{jobId}/{fileName}` | Download a single output file by name |
| `GET` | `/api/rhino/jobs/{jobId}/download-zip` | Download all job outputs as a single ZIP |

#### Configuration

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/config/tolerances/{pipeline_version}` | Get tolerance defaults for a pipeline version |

#### Brands

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/brands?pipeline_version={v}` | Get brand list grouped by category |
| `GET` | `/api/brands/migrations?pipeline_version={v}` | Get brand-name migration mapping |
| `POST` | `/api/brands/migrate` | Apply migration to brand data |

#### Fixtures

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/fixtures/blocks?pipeline_version={v}` | Get all fixture block definitions |
| `GET` | `/api/fixtures/types?pipeline_version={v}` | Get fixture type list |
| `GET` | `/api/fixtures/type/{type}/url?pipeline_version={v}` | Get GLB URL for a fixture type |
| `GET` | `/api/fixtures/type/{type}/block-name?pipeline_version={v}` | Get DWG block name for a fixture type |
| `GET` | `/api/fixtures/type/{type}/variants?pipeline_version={v}` | Get available variants for a fixture type |

### Stockflow Backend

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/tooling/processStore3DZip` | Submit store ZIP for 3D processing |

Target: `https://stockflow-core.rc.dg2n.com` (always RC; production URL commented out in vite.config).

### Response Format Compatibility

`getJobStatus` normalizes two response shapes:
```ts
// New format
if (result.data?.job) return result.data.job;
// Old format (direct)
return result;
```

## Changelog

| Date | Change |
|------|--------|
| 2026-03-03 | Generated from code analysis |
