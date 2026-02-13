# Store Layout 2D — Feature Documentation

## Overview

The Store Layout 2D page (`/layout/:store_id`) is a lightweight, SVG-based 2D viewer and editor for retail store fixture layouts. It loads the most recent live version's ZIP from Supabase, renders fixture blocks positioned per the location-master CSV, shows the floor outline extracted from floor GLB files, and allows editing brands and fixture types — all without loading the heavy Three.js 3D viewer.

---

## Architecture

```
StoreLayout (main page)
├── useStoreLayoutData()       → loads ZIP, parses CSV, fetches API mappings
├── useLayoutViewport()        → pan/zoom state and handlers
├── LayoutCanvas               → SVG canvas with pan/zoom transform
│   ├── FloorOutlineRenderer   → floor boundary edges + columns
│   └── FixtureSvgRenderer[]   → one per visible fixture
├── LayoutLeftPanel            → floor selector, type/brand filters, save button
├── LayoutRightPanel           → selected fixture details + edit buttons
├── BrandSelectionModal        → brand picker (reused from 3D editor)
└── FixtureTypeSelectionModal  → fixture type picker (reused from 3D editor)
```

### File Locations

| File | Path |
|------|------|
| Main page component | `src/components/StoreLayout/StoreLayout.tsx` |
| SVG canvas | `src/components/StoreLayout/LayoutCanvas.tsx` |
| Left filter panel | `src/components/StoreLayout/LayoutLeftPanel.tsx` |
| Right editor panel | `src/components/StoreLayout/LayoutRightPanel.tsx` |
| Fixture SVG renderer | `src/components/StoreLayout/FixtureSvgRenderer.tsx` |
| Floor outline renderer | `src/components/StoreLayout/FloorOutlineRenderer.tsx` |
| Data loading hook | `src/hooks/useStoreLayoutData.ts` |
| Viewport (pan/zoom) hook | `src/hooks/useLayoutViewport.ts` |
| Fixture SVG config | `src/utils/fixtureSvgConfig.ts` |
| Floor outline extractor | `src/utils/floorOutlineExtractor.ts` |
| CSV serializer | `src/utils/layoutCsvSerializer.ts` |
| Fixture SVG assets | `public/fixture_svg/*.svg` |

---

## Data Flow

### Loading

1. `useStoreLayoutData(storeId)` finds the most recent **live** store record from Supabase.
2. Downloads the ZIP and applies brand migration (`migrateBrandsInZip`).
3. Extracts all files; identifies floor GLB files via `isFloorFile()`.
4. Parses `location-master.csv` into `LocationData[]` (15-column format).
5. Fetches fixture type mapping (`/api/fixtures/block-types`) and brand category mapping from the API in parallel.

### Rendering

1. `StoreLayout` extracts floor outlines (boundary edges + columns) from each floor GLB via `extractFloorOutline()`.
2. `LayoutCanvas` filters fixtures by floor, type, and brand visibility, then renders:
   - `FloorOutlineRenderer` — floor boundary edges and column rectangles
   - `FixtureSvgRenderer` — one per visible fixture, positioned at `(posX, -posY)` in world space

### Saving

1. Opens the original `zipBlob` with JSZip.
2. Copies ALL files except `location-master.csv`.
3. Generates a new `location-master.csv` from the current `locationData` via `serializeLocationDataToCsv()`.
4. Runs `migrateBrandsInZip()` on the new ZIP.
5. Uploads the ZIP to Supabase storage.
6. Inserts a `store_saves` record.

---

## Coordinate System

| Domain | X | Y | Z |
|--------|---|---|---|
| CSV (location-master) | `posX` | `posY` | `posZ` |
| Three.js (3D scene) | `posX` | `posZ` (up) | `-posY` |
| SVG canvas (2D) | `posX` | `-posY` | — |

- **Rotation**: `rotationZ` from CSV maps to top-down rotation. Negated for the Y-flip: `rotation = -(rotationZ)`.
- **Floor outline**: Floor GLB meshes lie in the XZ plane in Three.js; vertices are projected to `[x, z]`.

---

## Pan / Zoom

Managed by `useLayoutViewport()`:

- **State**: `{ panX, panY, zoom }` where zoom = pixels per meter (default 40, range 5–500).
- **Transform**: A single `<g transform="translate(panX,panY) scale(zoom)">` wraps all canvas content. Children use world coordinates directly — no per-element recalculation.
- **Wheel zoom**: Non-passive listener (for `preventDefault`), factor 1.1 per tick, preserves world position under cursor.
- **Pan**: Middle-mouse drag or left-click on SVG background.
- **Fit to bounds**: `fitToBounds(outline.bounds, containerW, containerH)` auto-centers and scales on load with 60px padding.

### Performance

- `FixtureSvgRenderer` is wrapped in `React.memo` — only re-renders when its props change.
- Visible fixtures list is memoized with `useMemo` — only recomputed when data or filters change, not on pan/zoom.
- Floor outline path data is memoized on the `outline` object.

---

## Fixture Rendering

Each fixture is rendered by `FixtureSvgRenderer` as an SVG `<g>` group:

```
<g transform="translate(posX, -posY) rotate(-rotZ) translate(offsetX, offsetY)">
  for each count copy (side-by-side along local X):
    <rect>   — brand category color background (60% opacity)
    <image>  — fixture SVG shape from public/fixture_svg/
  <rect>     — red selection highlight (when selected)
  <circle>   — orange modification indicator (when changed)
  <text>     — brand label (visible at zoom > 20)
</g>
```

### SVG Image Rasterization Fix

Chrome rasterizes `<image>` content at the element's **user-unit** dimensions before applying parent transforms. With sub-meter world units (e.g. 0.6m × 0.425m), the SVG content is invisible. The fix wraps `<image>` in `<g transform="scale(1/100)">` with dimensions multiplied by 100, forcing Chrome to rasterize at 100× resolution.

### Wall-Bay Count Logic

Matches the 3D modifier: fixtures with `count > 1` render N copies side-by-side along the local X axis, centered around the original position. Each copy is spaced by the fixture's width. The selection highlight spans the entire stack.

---

## Fixture Configuration

All fixture visual properties are defined in `src/utils/fixtureSvgConfig.ts`:

| Fixture Type | SVG File | World Size (m) | Offset |
|---|---|---|---|
| 4-WAY | RTL-4W.svg | 1.1 × 1.1 | [0, 0] |
| A-RAIL | RTL-SR.svg | 1.2 × 0.85 | [0, 0] |
| H-GONDOLA | RTL-HG.svg | 2.3 × 1.022 | [0, 0] |
| NESTED-TABLE | RTL-NT.svg | 1.5 × 1.2 | [0, 0] |
| ACC-GONDOLA | RTL-AG.svg | 0.75 × 0.75 | [0, 0] |
| IMPULSE | RTL-IF.svg | 1.2 × 0.525 | [0, 0] |
| WALL-BAY | RTL-WPS.svg | 0.6 × 0.425 | [0, 0.28] |
| GLASS-TABLE | TJR-NT.svg | 0.549 × 0.561 | [0, 0] |

**`FIXTURE_SVG_SCALE`** (default 1.0) is a global multiplier applied to all fixture sizes.

**`PX_TO_M = 1/1000`** converts SVG viewBox pixel values to meters. Sizes are defined as `viewBoxPx * PX_TO_M`.

**Adding a new fixture type**: Add entries to `FIXTURE_SVG_PATHS`, `FIXTURE_SVG_SIZES`, and `FIXTURE_OFFSETS`. Place the SVG file in `public/fixture_svg/`. Ensure the key matches the fixture type name returned by the API.

### Debugging Fixture Types

A commented-out debug label in `FixtureSvgRenderer.tsx` shows the resolved `fixtureType` and `w×h` above each fixture. Uncomment it to diagnose type resolution mismatches (e.g. if the API returns a different name than the config key).

---

## Floor Outline Extraction

`extractFloorOutline()` in `src/utils/floorOutlineExtractor.ts`:

1. Loads the floor GLB via `GLTFLoader.parse()` with DRACO decompression.
2. Traverses all meshes in the scene:
   - **Column meshes** (name contains "column" or "pillar"): Extracts bounding box in XZ plane → `ColumnRect { cx, cy, width, depth }`.
   - **Other meshes** (floor): Projects triangles to XZ plane, counts edge occurrences per mesh, keeps edges with count=1 (boundary edges).
3. Returns `FloorOutline { edges, bounds, columns }`.

### Why Boundary Edges

A convex hull would lose the floor's actual non-convex shape (indentations, alcoves). Rendering all triangles shows internal wireframe. Boundary edges (appearing in only one triangle) give the correct outline without internal detail.

---

## Filtering

The left panel provides three filter dimensions:

| Filter | Behavior |
|--------|----------|
| **Floor** | Dropdown; only fixtures on the selected floor are shown |
| **Fixture Type** | MultiSelect; selecting "All" shows everything; otherwise only checked types |
| **Brand** | MultiSelect; selecting "All" shows everything; otherwise only checked brands |

The "All" option works via `visibleFixtureTypes.includes('all')` check — when the MultiSelect value contains `"all"`, the type/brand filter is bypassed entirely.

---

## Editing

### Brand Change

1. Select a fixture on the canvas (click).
2. In the right panel, click the pencil icon next to **Brand**.
3. `BrandSelectionModal` opens with all available brands.
4. On selection, `locationData` is updated: `brand` set to new value, `wasBrandChanged` flag set, `_updateTimestamp` recorded.
5. The fixture's background color updates to reflect the new brand category.

### Fixture Type Change

1. Select a fixture; click pencil icon next to **Fixture Type**.
2. `FixtureTypeSelectionModal` opens.
3. On selection, `blockName` is updated, `wasTypeChanged` flag set.
4. The fixture's SVG shape and size update to match the new type.

### Reset

Click "Reset" in the right panel to revert a fixture to its original brand and block name. All change flags are cleared.

---

## Change Tracking

Each `LocationData` object stores both current and original values:

| Current | Original | Flag |
|---------|----------|------|
| `blockName` | `originalBlockName` | `wasTypeChanged` |
| `brand` | `originalBrand` | `wasBrandChanged` |
| `posX/Y/Z` | `originalPosX/Y/Z` | `wasMoved` |
| `rotationX/Y/Z` | `originalRotationX/Y/Z` | `wasRotated` |
| `count` | `originalCount` | `wasCountChanged` |

Visual indicators:
- **Orange dot** (top-right of fixture): brand or type was changed.
- **Red strikethrough** (right panel): original value.
- **Green text** (right panel): new value.

---

## Theming

The canvas background matches the 3D viewer: `bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800`.

| Element | Light Mode | Dark Mode |
|---------|------------|-----------|
| Canvas background | Slate 100→200 gradient | Slate 900→800 gradient |
| Floor outline stroke | `#334155` | `slate-300` |
| Column fill | `#64748b` | `slate-500` |
| Brand label | White text, black outline | White text, black outline |
| Selection highlight | `#ef4444` (red) | `#ef4444` (red) |

---

## Route & Navigation

- **Route**: `/layout/:store_id` (lazy-loaded via `React.lazy`)
- **Nav link**: "Store Layout" in the navbar (desktop and mobile)
- **Direct URL**: Primary access method — navigate to `/layout/{store_id}` with a known store ID

---

## Shared Code

The following are reused from the 3D editor:

| What | Source |
|------|--------|
| `LocationData`, `generateFixtureUID()` | `src/hooks/useFixtureSelection.ts` |
| `useSupabaseService()` | `src/services/supabaseService.ts` |
| `extractZipFiles()`, `isFloorFile()` | `src/utils/zipUtils.ts` |
| `getBrandCategoryColor()` | `src/utils/brandColorUtils.ts` |
| `fetchBlockTypeMapping()` | `src/services/fixtureTypeMapping.ts` |
| `migrateBrandsInZip()` | `src/utils/brandMigration.ts` |
| `BrandSelectionModal` | `src/components/BrandSelectionModal.tsx` |
| `FixtureTypeSelectionModal` | `src/components/FixtureTypeSelectionModal.tsx` |

---

## Known Considerations

1. **Fixture type name mismatch**: The API may return different type names than the config keys (e.g. `IMPULSE` vs `IMPULSE-FIXTURE`). Use the debug label to identify mismatches and add aliases to `fixtureSvgConfig.ts`.

2. **SVG rasterization at small sizes**: Chrome rasterizes `<image>` at user-unit dimensions. The 100× scale workaround ensures all fixture SVGs render visibly regardless of world-unit size.

3. **Floor outline projection**: Floor meshes are projected to XZ (not XY), matching Three.js convention where floors lie in the XZ plane.

4. **Save preserves 3D data**: The save flow copies all original files (GLBs, configs, etc.) unchanged — only `location-master.csv` is regenerated. This ensures 3D compatibility is maintained.
