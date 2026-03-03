# ZIP Processing Pipeline

## Overview

Store data is packaged as ZIP archives containing `.glb` (3D geometry) and `.csv` (fixture location data) files. The pipeline covers upload → processing → storage → load → edit → re-export → save. JSZip is used throughout.

## Requirements

- ZIP archives MUST contain at least one `.glb` file and one location CSV.
- On load, `.glb` files MUST be extracted and loaded into Three.js; CSV files MUST be parsed into fixture arrays.
- On save/export, the location CSV MUST be updated in-place within the ZIP (not appended), then the ZIP re-uploaded to Supabase.
- Brand migration MUST be applied to ZIP contents before the updated archive is stored.

## Design Decisions

### Upload Pipeline (DWG → Processed ZIP)

```
User selects DWG file
  → FileUpload.tsx: POST /api/jobs/upload (multipart)
  → Fastify backend: queues Rhino/Grasshopper job
  → Job status polled via GET /api/jobs/{jobId}
  → On completion: download ZIP via GET /api/rhino/jobs/{jobId}/download-zip
  → User saves to Supabase: supabaseService → store-archives bucket
```

### Load Pipeline (ZIP → 3D Scene)

```
useStoreLayoutData:
  1. supabase.storage.from(bucket).download(zip_path)
  2. zipUtils.loadZip(blob) → JSZip instance
  3. Enumerate files by extension
  4. .glb files → blob URL → Three.js GLTFLoader → scene objects
  5. .csv files → csvUtils.parseLocationCsv() → FixtureModificationEntry[]
  6. Fetch brands + tolerances from Fastify API
  7. Render 3D scene + populate useFixtureModifications state
```

### Save Pipeline (Edited State → ZIP → Supabase)

```
User triggers save:
  1. layoutCsvSerializer.serialize(modifications) → updated CSV string
  2. Load original ZIP from Supabase (or reuse in-memory)
  3. Replace CSV file entry in JSZip instance
  4. zip.generateAsync({ type: 'blob' }) → new ZIP blob
  5. supabase.storage.from(bucket).upload(path, blob, { upsert: true })
  6. Update store_saves record with new path/metadata
```

### Brand Migration in ZIP

`brandMigration.ts` applies a brand migration map (fetched from `/api/brands/migrations`) to the CSV content inside a ZIP:

```
Load ZIP → parse CSV → for each row: map brand name via migration table → write updated CSV → re-pack ZIP
```

### Key Dependency: `JSZip`

- Version: `jszip@3.10.1`
- Used in: `FileUpload.tsx`, `3DViewerModifier.tsx`, `useStoreLayoutData.ts`, `brandMigration.ts`, `batch-*.mjs` scripts
- GLB files are extracted as `Uint8Array` or `ArrayBuffer` and converted to blob URLs for Three.js

## Changelog

| Date | Change |
|------|--------|
| 2026-03-03 | Generated from code analysis |
