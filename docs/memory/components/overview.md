# Components

## Overview

The `src/components/` directory contains 31 React TSX files (~17.3k LOC total) organized into the 3D viewer, 2D store layout editor, modal dialogs, and supporting UI. The two heaviest components — `3DViewerModifier.tsx` (5,530 LOC) and `Canvas3D.tsx` (2,729 LOC) — are lazy-loaded at the router level.

## Requirements

- The 3D viewer (`/3d-viewer-modifier`) MUST be lazy-loaded via `React.lazy()` to avoid blocking initial page paint.
- The store layout page (`/layout/:store_id`) MUST also be lazy-loaded; it renders in both edit and view-only modes (same component, different path suffix `/view`).
- `QrFixtureRedirect` MUST be lazy-loaded and handles `/qr/:payload` routes for QR code → fixture lookup.
- `AuthGate` MUST wrap all routes; unauthenticated users MUST be blocked before any route renders.
- The Navbar MUST be rendered above all routes and persists across page transitions.

## Design Decisions

### Component Tree

```
App
├── AuthProvider > StoreProvider > ThemeProvider
├── AuthGate  (blocks render until auth is resolved)
├── Navbar    (always visible, pt-24 spacer beneath)
└── Routes (Suspense-wrapped)
    ├── /                        → Home
    ├── /cad-to-3d               → CadTo3D
    ├── /3d-viewer-modifier      → ThreeDViewerModifier [lazy]
    ├── /my-stores               → MyCreatedStores
    ├── /jobs                    → Jobs
    ├── /layout/:store_id        → StoreLayout [lazy]
    ├── /layout/:store_id/view   → StoreLayout [lazy]
    └── /qr/:payload             → QrFixtureRedirect [lazy]
```

### Major Component Groups

| Group | Files | Purpose |
|---|---|---|
| **3D Editor** | `3DViewerModifier.tsx`, `Canvas3D.tsx`, `LeftControlPanel.tsx`, `RightInfoPanel.tsx`, `ObjectInfoPanel.tsx` | 3D fixture editing, Three.js rendering, property panels |
| **2D Layout** | `StoreLayout/` (5 files) | 2D floor plan editor with pan/zoom, fixture SVG rendering |
| **Modals** | 20+ `*Modal.tsx` / `*Dialog.tsx` | Fixture/brand selection, delete/paste confirmation, tolerance override, split fixtures |
| **Store Management** | `MyCreatedStores.tsx` (1,273 LOC), `Jobs.tsx` (896 LOC) | Store list, job tracking, live status |
| **Auth/Nav** | `AuthGate.tsx`, `Navbar.tsx`, `Home.tsx` | Authentication gating, navigation, landing |
| **Utility UI** | `FileUpload.tsx`, `ClipboardNotification.tsx`, `JobStatus.tsx`, `LiveStatusTab.tsx` | File input, feedback notifications |

### StoreLayout Sub-components

`src/components/StoreLayout/`:
- `StoreLayout.tsx` — top-level container, loads data, manages view vs edit mode
- `LayoutCanvas.tsx` — SVG canvas with pan/zoom viewport
- `LayoutLeftPanel.tsx` — controls and fixture list
- `LayoutRightPanel.tsx` — fixture property editor
- `FixtureSvgRenderer.tsx` — renders individual fixture shapes
- `FloorOutlineRenderer.tsx` — renders store floor boundary

### `React.StrictMode` is disabled

`main.tsx` does NOT use `StrictMode` — this is intentional due to blob URL lifecycle issues with Three.js GLB loading. Do not re-enable without testing.

## Changelog

| Date | Change |
|------|--------|
| 2026-03-03 | Generated from code analysis |
