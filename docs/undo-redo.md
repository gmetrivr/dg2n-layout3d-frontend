# Undo/Redo System

## Overview

The 3D Viewer supports full undo/redo for all fixture and architectural object modifications. The system uses the **Command Pattern** — every user action that mutates state is wrapped in a `Command` object with `do()` and `undo()` methods, pushed onto a history stack.

## Architecture

```
useUndoRedo()          — hook managing past/future stacks + canUndo/canRedo state
  ├── executeCommand() — calls cmd.do(), pushes to past, clears future
  ├── handleUndo()     — pops from past, calls cmd.undo(), pushes to future
  └── handleRedo()     — pops from future, calls cmd.do(), pushes to past

fixtureHelpers.ts      — shared lookup/update utilities
  ├── ensureStableId() — assigns _stableId UUID if missing
  ├── findFixtureById()
  ├── updateFixtureById()
  ├── findObjectById()
  └── updateObjectById()
```

### Key files

| File | Role |
|---|---|
| `src/hooks/useUndoRedo.ts` | `Command` interface, undo/redo hook (past/future stacks via `useRef`) |
| `src/hooks/fixtureHelpers.ts` | ID-based lookup and update helpers for fixtures and arch objects |
| `src/hooks/useFixtureSelection.ts` | `LocationData` type (includes `_stableId`), ID-based selection state |
| `src/hooks/useFixtureModifications.ts` | All fixture mutation handlers wrapped as commands |
| `src/components/3DViewerModifier.tsx` | All arch object handlers wrapped as commands, wiring |
| `src/hooks/useKeyboardShortcuts.ts` | Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z bindings |
| `src/components/LeftControlPanel.tsx` | Undo/Redo toolbar buttons |

## Core concepts

### Command interface

```typescript
interface Command {
  commandName: string;  // For debug logging
  do(): void;
  undo(): void;
}
```

History is capped at **20 entries**. `past` and `future` are `useRef<Command[]>` arrays so that pushing/popping doesn't trigger re-renders. Only `canUndo` / `canRedo` are `useState<boolean>` (for UI binding).

### `_stableId` — permanent fixture identity

Every `LocationData` fixture has a `_stableId: string` field — a UUID assigned once and never changed. This replaces the old `generateFixtureUID()` approach (which was position+timestamp based and broke when fixtures moved).

- Assigned on CSV load via `ensureStableId()`.
- Assigned inline via `crypto.randomUUID()` on creation (duplicate, split, paste, click-to-place).
- Used as the key for `deletedFixtures: Set<string>`.
- Used for all ID-based selection state.

### ID-based selection

Selection state stores **IDs**, not object references:

```
selectedLocationId: string | null      — single fixture selection
selectedLocationIds: string[]          — multi fixture selection
selectedObjectId: string | null        — single arch object selection
selectedObjectIds: string[]            — multi arch object selection
```

The actual objects are derived via `useMemo`:

```typescript
const selectedLocation = useMemo(
  () => locationData.find(loc => loc._stableId === selectedLocationId) ?? null,
  [locationData, selectedLocationId]
);
```

This means commands only need to update `locationData` / `architecturalObjects` — the derived selection objects update automatically.

### State refs for stale-closure safety

Command closures capture variables at creation time. If `undo()` runs later and reads `locationData`, it would see a stale snapshot. To solve this:

```typescript
const locationDataRef = useRef(locationData);
useEffect(() => { locationDataRef.current = locationData; }, [locationData]);

const architecturalObjectsRef = useRef(architecturalObjects);
useEffect(() => { architecturalObjectsRef.current = architecturalObjects; }, [architecturalObjects]);
```

Commands read from `locationDataRef.current` / `architecturalObjectsRef.current` when they need current state (e.g., for selection restoration in undo).

## Command table

### Fixture commands (in `useFixtureModifications.ts`)

| Handler | commandName | Notes |
|---|---|---|
| `handlePositionChange` | `MoveFixture` | |
| `handleRotateFixture` | `RotateFixture` | |
| `handleMultiRotateFixture` | `RotateFixture` | Multi-selection variant |
| `handleMultiPositionChange` | `MoveFixtures` | Captures absolute positions, not delta |
| `handleResetPosition` | `ResetFixture` | |
| `handleResetMultiplePositions` | `ResetFixtures` | |
| `handleBrandChange` | `FloorBrandChange` | Floor plate brand |
| `handleFixtureBrandChange` | `BrandChange` | |
| `handleFixtureCountChange` | `CountChange` | |
| `handleFixtureCountChangeMulti` | `CountChange` | Multi variant |
| `handleFixtureHierarchyChange` | `HierarchyChange` | |
| `handleDuplicateFixture` | `DuplicateFixture` | Assigns new `_stableId` |
| `handleConfirmDelete` | `DeleteFixture` | Adds to `deletedFixtures` set |
| `handleSplitFixture` | `SplitFixture` | Creates two new fixtures |
| `handleMergeFixtures` | `MergeFixtures` | Frozen snapshots for undo |
| `handleAlignFixtures` | `AlignFixtures` | |

### Arch object commands (in `3DViewerModifier.tsx`)

| Handler | commandName | Notes |
|---|---|---|
| `handleObjectPositionChange` | `MoveObject` | Uses `findObjectById` + `updateObjectById` |
| `handleMultiObjectPositionChange` | `MoveObjects` | Captures per-object snapshots |
| `handleObjectRotate` | `RotateObject` | |
| `handleObjectHeightChange` | `ObjectHeightChange` | |
| `handleSinglePointPositionChange` | `MoveObject` | Doors, columns, etc. |
| `handleObjectPointsChange` | `MoveObject` | Two-point start/end editing |
| `handleObjectDelete` | `DeleteObject` | Restores object on undo |
| `handleObjectReset` | `ResetObject` | |
| `handleObjectVariantChange` | `ObjectVariantChange` | |
| `handleGizmoRotationChange` | `GizmoRotation` | Uses `_stableId` for fixture lookup |
| `executePaste` | `Paste` | Assigns `_stableId` to pasted items |
| `handleFixtureTypeChange` | `ChangeFixtureType` | Async (API call before command) |
| `handleMultiFixtureTypeChange` | `ChangeFixtureTypeMulti` | |
| Floor-click fixture placement | `CreateFixture` | |
| Floor-click object placement | `CreateObject` | |

### Selection rules

| Rule | When | Selection behavior |
|---|---|---|
| Rule 1 | In-place edits (move, rotate, brand, count, etc.) | No selection change |
| Rule 2 | Delete-like operations (delete, split, merge) | Clear selection in `do()`, restore in `undo()` |
| Rule 3 | Create operations (duplicate, paste, place) | Select new item in `do()`, clear in `undo()` |

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+Shift+Z` | Redo (alternative) |

All shortcuts have a **focus guard** — they are skipped when focus is inside `input`, `textarea`, `select`, or `[contenteditable]` elements.

## Learnings from implementation

### 1. Never use object references as selection state

Storing `selectedLocation: LocationData` as state means the object becomes stale the moment `locationData` is updated. Commands that modify fixtures then need to also manually update `selectedLocation` with a functional updater — doubling every mutation and creating a large surface area for bugs.

**Solution**: Store IDs (`selectedLocationId: string`) and derive objects via `useMemo`. Commands only need to update the source-of-truth array.

### 2. Position-based UIDs are fragile

The original `generateFixtureUID()` used `blockName + position + timestamp` to identify fixtures. This breaks when a fixture is moved (the UID changes). Deletion tracking stored old UIDs, so moved-then-deleted fixtures weren't filtered out.

**Solution**: `_stableId` — a UUID assigned once at creation/load, never modified. All identity-based operations (deletion, selection, command lookup) use this.

### 3. Stale closures are the #1 undo/redo pitfall

A command's `undo()` closure captures variables from when the command was created. If it reads `locationData` directly, it sees stale data. This is especially dangerous for selection restoration — the undo might try to select a fixture that no longer exists at the captured index.

**Solution**: Use `useRef` mirrors (`locationDataRef`, `architecturalObjectsRef`) synced via `useEffect`. Command closures read `.current` to always get fresh state.

### 4. Capture primitives, not objects

Capturing an entire `LocationData` object in a command closure risks capturing stale nested references. Instead, capture only the primitive fields needed for undo:

```typescript
// Good — primitives captured at call time
const prevX = current.posX;
const prevY = current.posY;

// Bad — object ref may be stale
const prevLocation = current;
```

Exception: for delete/create commands, a frozen shallow snapshot is fine since the whole object is removed/added.

### 5. `do()` must be idempotent

`executeCommand` calls `do()` immediately. On redo, `do()` is called again. The function must produce the same result both times. For create commands, guard against double-adding:

```typescript
do() {
  setLocationData(prev => {
    if (prev.some(loc => loc._stableId === newId)) return prev;
    return [...prev, newItem];
  });
}
```

### 6. Async commands need special handling

`handleFixtureTypeChange` calls an API before creating the command. The pattern is:

1. Capture all current values (primitives) **before** `await`
2. Call the API
3. Only call `executeCommand()` if the API succeeds
4. The command's `do()` / `undo()` use only the pre-captured values

This avoids having async operations inside `do()` / `undo()`.

### 7. Removing derived-state updaters

When selection was object-based, every handler had paired updaters:

```typescript
setArchitecturalObjects(prev => prev.map(...));  // update source
setSelectedObject(prev => ({ ...prev, ... }));   // update derived copy
```

With ID-based selection, the second call is unnecessary — the derived `selectedObject` via `useMemo` updates automatically. Removing these eliminates an entire class of bugs where the source and derived state could diverge.

### 8. Panel components with local type definitions drift

`RightInfoPanel.tsx` and `MultiRightInfoPanel.tsx` had their own local `interface LocationData { ... }` that was a copy of the canonical one. When `_stableId` was added to the canonical type, these local copies weren't updated, causing type mismatches at the component boundaries.

**Solution**: Replace local interface definitions with `import type { LocationData } from '../hooks/useFixtureSelection'`.

### 9. `useRef` stacks avoid render churn

The undo/redo stacks (`past` and `future`) are `useRef<Command[]>` rather than `useState`. Pushing/popping commands doesn't trigger re-renders. Only the `canUndo`/`canRedo` booleans are `useState` — they're the minimal reactive surface needed for the UI buttons.

### 10. No `uuid` package needed

`crypto.randomUUID()` is available in all modern browsers. A fallback using `Date.now() + Math.random()` covers edge cases. This avoids adding a dependency for a single function call.
