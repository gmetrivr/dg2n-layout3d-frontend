# Floor Layout PDF Export

## Overview

The Store Layout 2D view includes a **Download Layout PDF** button that exports all floors of a store's fixture layout as a self-contained HTML file. Opening the file in a browser and printing to PDF produces one A4 landscape page per floor, with every fixture drawn to scale, labelled with its brand name and fixture ID.

---

## User Guide

1. Open any store in the Store Layout 2D view (`/layout/:store_id` or `/layout/:store_id/view`).
2. Expand the left control panel if it is collapsed.
3. Click **Download Layout PDF** at the bottom of the panel.
   - The button fetches all fixture SVG assets and embeds them, so allow a brief moment on slow connections.
4. A file named `<StoreName>_layout.html` is downloaded automatically.
5. Open the file in **Chrome or Edge** (recommended for best SVG print fidelity).
6. Press `Ctrl+P` / `Cmd+P`.
7. Set orientation to **Landscape** and paper size to **A4**, then **Save as PDF**.

> Each floor is on its own page. The instruction banner at the top of the HTML is hidden automatically when printing.

---

## What Is Shown on Each Page

| Element | Description |
|---|---|
| Floor outline | Wall boundary and columns extracted from the floor's GLB model |
| Fixture shape | The fixture's SVG icon (same as the interactive canvas), embedded at full resolution |
| Coloured fill | Brand category colour (cyan = mens casual, yellow = womens ethnic, etc.) at 70 % opacity overlaid on the shape |
| Brand label | Bold text immediately below each fixture, sized proportionally to the fixture's footprint |
| Fixture ID | Smaller grey text below the brand label (only shown for fixtures that have been made live and have an assigned ID) |

Fixtures that are marked `forDelete` are excluded. All active fixtures across every floor index are included regardless of any active filters in the UI.

---

## Implementation

### Files Changed

| File | Change |
|---|---|
| `src/services/layoutPdfService.ts` | New service — generates the HTML/SVG and triggers the download |
| `src/components/StoreLayout/LayoutLeftPanel.tsx` | Added `onDownloadPdf` prop and **Download Layout PDF** button |
| `src/components/StoreLayout/StoreLayout.tsx` | Wires up `handleDownloadPdf` callback and passes it to `LayoutLeftPanel` |

---

### `layoutPdfService.ts`

#### `downloadLayoutPdf(options)` — `async`

The public entry point. Accepts:

```ts
interface DownloadLayoutPdfOptions {
  locationData: LocationData[];
  floorOutlines: Record<number, FloorOutline>;
  floorIndices: number[];
  fixtureTypeMap: Map<string, string>;
  brandCategoryMapping: Record<string, string>;
  storeName: string;
  storeId: string;
}
```

**Steps:**

1. Collects all unique fixture types present in `locationData`.
2. Fetches each fixture's SVG file from `/fixture_svg/` in parallel and converts it to a `data:image/svg+xml;base64,...` URI via `fetchSvgDataUri()`. This makes the output HTML fully self-contained — no web server is needed to open it later.
3. Calls `generateFloorSvg()` for every floor index.
4. Wraps all floor SVGs in `generatePrintableHTML()`.
5. Creates a `Blob` and triggers a browser download.

#### `generateFloorSvg()`

Builds the SVG markup for one floor:

- **Bounds** are taken from `FloorOutline.bounds` when available, otherwise computed from fixture positions.
- A 2 m padding is added around the bounds.
- **Floor outline** is drawn from `FloorOutline.edges` as a `<path>`, columns as `<rect>` elements.
- For each fixture a `<g>` group is emitted with the same `translate / rotate / translate(offset)` transform chain used by `FixtureSvgRenderer` in the interactive canvas, ensuring visual consistency.
- The fixture SVG image uses an **IMG_SCALE = 50** upscale-then-downscale trick (identical to the live canvas) so browsers rasterize the image at sufficient resolution before the parent SVG transform scales it back down.
- **Font size** is computed per fixture as:
  ```
  fontSize = Math.sqrt(totalWidth × h) × 0.18
  ```
  Using the geometric mean of the fixture's total footprint (width × count × height) keeps labels proportional whether the fixture is a narrow single wall-bay (≈ 0.09 m) or a wide multi-bay strip or large table.

#### `generatePrintableHTML()`

Wraps the per-floor SVGs in a minimal HTML document with:

- `@page { size: A4 landscape; margin: 8mm; }` — browser print engine handles page sizing.
- Each `.floor-page` is a flex column constrained to `calc(210mm − 16mm)` tall and `calc(297mm − 16mm)` wide in print media, with `break-after: page`.
- `.floor-svg-wrap` uses `flex: 1; min-height: 0` so the SVG stretches to fill the remaining height after the floor title. `min-height: 0` is required to allow flex children to shrink below their intrinsic content size.
- The SVG uses `preserveAspectRatio="xMidYMid meet"` so irregular floor shapes are centred and fully visible without distortion.

---

### Font Size Rationale

Previous approaches and why they were changed:

| Approach | Problem |
|---|---|
| `vbW × 0.013` (floor-width relative) | Produced 0.35 m text on a 30 m floor — larger than some fixtures |
| `h × 0.13` (fixture-height relative) | Wall bays (h = 0.43 m) gave 0.056 m text — unreadably small |
| `√(totalWidth × h) × 0.18` (geometric mean) | Balances both dimensions; single wall bay ≈ 0.09 m, large tables ≈ 0.24 m |

---

### Print Layout Dimensions (A4 Landscape)

```
Page:          297 mm × 210 mm
@page margin:    8 mm each side
Content area:  281 mm × 194 mm
Floor title:    ~10 mm (12 pt)
SVG area:      281 mm × ~184 mm
```
