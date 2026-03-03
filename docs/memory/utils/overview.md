# Utils

## Overview

`src/utils/` contains 9 utility modules covering ZIP/CSV file processing, fixture ID generation, space occupancy analysis, brand colour mapping, SVG fixture configuration, floor outline extraction, brand migration, and CSV serialization for layout exports.

## Requirements

- `zipUtils` MUST identify file types within ZIP archives by extension (`.glb`, `.csv`, etc.) for downstream routing.
- `csvUtils` MUST parse and generate CSV in the location data format expected by the Fastify/Rhino pipeline.
- `fixtureIdUtils` MUST generate deterministic IDs based on position and block name so re-runs produce the same IDs for unchanged fixtures.
- `brandColorUtils` MUST map brand names → category → RGB tuple consistently with the colour scheme shown in Canvas3D.

## Design Decisions

### Utility Inventory

| Module | LOC | Responsibility |
|---|---|---|
| `spaceTrackerUtils.ts` | ~10,369 | Space occupancy analysis — derives area utilization metrics from location CSV data |
| `csvUtils.ts` | — | Parse/generate location data CSV and store master CSV |
| `zipUtils.ts` | — | Load ZIP via JSZip, enumerate and classify contained files by extension |
| `layoutCsvSerializer.ts` | — | Serialize current fixture state (from `useFixtureModifications`) to CSV for export |
| `brandMigration.ts` | — | Apply brand migration map to fixture entries inside a ZIP; transforms brand names in-place |
| `brandColorUtils.ts` | — | `brandCategoryMapping: Record<string, string>` + RGB tuples per category for 3D colour coding |
| `fixtureIdUtils.ts` | — | Generate/validate dg2n fixture IDs; deterministic UID from block name + position |
| `fixtureSvgConfig.ts` | — | SVG shape configurations for each fixture type in the 2D layout view |
| `floorOutlineExtractor.ts` | — | Extract floor boundary geometry from a loaded GLB scene for 2D layout display |

### Fixture UID Generation

Two UID types are used:
- **Current UID**: `${blockName}-${posX}-${posY}-${posZ}-${timestamp}` — used for in-session selection tracking.
- **Original UID**: Uses the fixture's *original* position (at load time) — used to match modified fixtures back to their CSV rows for export.

### Brand Category → Colour Mapping

```ts
brandCategoryMapping: Record<string, string>  // brand name → category string
brandColors: Record<string, [number, number, number]>  // category → RGB
```

Used in Canvas3D to colour-code fixtures by brand category in the 3D view.

### ZIP Processing Flow

1. `zipUtils.loadZip(blob)` — parse raw bytes into `JSZip` instance
2. Enumerate files, classify by extension
3. GLB files → Three.js loader → 3D scene
4. CSV files → `csvUtils.parseLocationCsv()` → fixture array
5. On export: `layoutCsvSerializer.serialize()` → updated CSV → re-pack into ZIP → upload to Supabase

## Changelog

| Date | Change |
|------|--------|
| 2026-03-03 | Generated from code analysis |
