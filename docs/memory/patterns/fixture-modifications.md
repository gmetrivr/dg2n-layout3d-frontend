# Fixture Modification Tracking

## Overview

Fixture modifications are tracked by storing both the **original state** (at load time) and the **current state** for each fixture, along with boolean change flags. This dual-state model enables undo/redo, CSV diff generation, and revert-to-original operations.

## Requirements

- Every fixture that can be edited MUST have `original*` fields populated at load time, before any edits.
- Change flags (`wasMoved`, `wasRotated`, etc.) MUST be derived from comparing current vs original state.
- Undo operations MUST restore the previous state snapshot via the Command pattern.
- The CSV export MUST use original position fields to match fixtures back to their source CSV rows.

## Design Decisions

### State Shape

```ts
interface FixtureModificationEntry {
  // Original state — captured at load, used for CSV row matching and revert
  originalPosX: number;
  originalPosY: number;
  originalPosZ: number;
  originalRotationY: number;
  originalRotationZ: number;
  originalBrand: string;
  originalCount: number;

  // Current state — reflects all applied edits
  posX: number;
  posY: number;
  posZ: number;
  rotationY: number;
  rotationZ: number;
  brand: string;
  count: number;

  // Change flags — set when current ≠ original
  wasMoved: boolean;
  wasRotated: boolean;
  wasBrandChanged: boolean;
  wasCountChanged: boolean;
  wasTypeChanged: boolean;
}
```

### Fixture UID Keys

Fixtures are keyed in the modification map by two UIDs:

- **Current UID**: `${blockName}-${posX}-${posY}-${posZ}-${timestamp}` — stable for the session
- **Original UID**: Built from original position — used to match back to CSV rows on export

### Undo/Redo Integration

Each mutation (move, rotate, brand change, etc.) creates a `Command` object:

```ts
{
  commandName: 'MoveFixture',
  do: () => applyNewState(fixture, newState),
  undo: () => applyNewState(fixture, previousState),
}
```

Commands are passed to `useUndoRedo.executeCommand()` which manages the past/future stacks (capped at 20).

### CSV Export

On save/export, `layoutCsvSerializer` uses the **original position** fields to locate each fixture's row in the source CSV, then writes the current position/brand/count values. Fixtures with no changes are written back unchanged. New fixtures (pasted) are appended.

### Copy/Paste

`useClipboard` snapshots the full `FixtureModificationEntry` for selected fixtures. On paste, `usePasteValidation` validates the clipboard data against current store constraints before `PasteConfirmationDialog` is shown.

## Changelog

| Date | Change |
|------|--------|
| 2026-03-03 | Generated from code analysis |
