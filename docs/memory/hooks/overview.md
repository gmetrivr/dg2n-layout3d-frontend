# Hooks

## Overview

`src/hooks/` contains 9 custom React hooks that encapsulate the application's core logic: fixture state management, clipboard operations, undo/redo, keyboard shortcuts, 2D viewport control, and store data loading. The two largest — `useClipboard.ts` (~15k LOC) and `useFixtureModifications.ts` (~7.4k LOC) — handle the bulk of 3D editor interactivity.

## Requirements

- `useUndoRedo` MUST cap the undo stack at 20 commands; older entries MUST be discarded silently.
- `useKeyboardShortcuts` MUST NOT intercept key events when focus is inside `input`, `textarea`, `select`, or `[contenteditable]` elements.
- `useKeyboardShortcuts` MUST support both Mac (Cmd) and Windows/Linux (Ctrl) modifier keys.
- `useStoreLayoutData` MUST extract ZIP content (CSV + GLB files) from a Supabase-stored archive before the layout editor can render.
- `usePasteValidation` MUST validate pasted fixture data against schema constraints before any paste confirmation dialog is shown.

## Design Decisions

### Hook Inventory

| Hook | LOC | Responsibility |
|---|---|---|
| `useFixtureModifications.ts` | ~7,439 | Position/rotation/brand/count changes; stores original + current state; drives undo commands |
| `useClipboard.ts` | ~15,243 | Copy/paste of fixtures with validation; produces `PasteConfirmationDialog` data |
| `useFixtureSelection.ts` | — | Single and multi-fixture selection state |
| `useUndoRedo.ts` | 46 | Command pattern stack (past/future refs, 20-entry cap) |
| `useKeyboardShortcuts.ts` | 69 | Keyboard event wiring (Ctrl+C/V/Z/Y, Delete) |
| `usePasteValidation.ts` | — | Schema validation for clipboard fixture data |
| `useStoreLayoutData.ts` | — | Load store ZIP from Supabase, extract CSV/GLB, fetch brand/tolerance config |
| `useLayoutViewport.ts` | — | Pan, zoom, fit-to-bounds for 2D canvas |
| `fixtureHelpers.ts` | — | Utility functions shared across hooks (not a hook itself) |

### `useUndoRedo` — Command Pattern

```ts
interface Command {
  commandName: string;
  do(): void;
  undo(): void;
}
```

- Commands are stored in `useRef` arrays (not state) to avoid re-renders.
- `executeCommand` calls `cmd.do()`, pushes to `past`, clears `future`.
- `handleUndo` pops from `past`, calls `cmd.undo()`, pushes to `future`.
- `handleRedo` pops from `future`, calls `cmd.do()`, pushes back to `past`.
- `canUndo` / `canRedo` are `useState` booleans updated after each stack mutation.

### `useKeyboardShortcuts` — Bindings

| Shortcut | Action |
|---|---|
| Ctrl/Cmd + C | `onCopy` |
| Ctrl/Cmd + V | `onPaste` |
| Ctrl/Cmd + Z | `onUndo` |
| Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z | `onRedo` |
| Delete (no modifier) | `onDelete` |

Pass `enabled: false` to disable all bindings (e.g. when a modal is open).

### `useFixtureModifications` — State Shape

Each fixture modification entry tracks both original and current state to support undo and CSV diff generation:

```ts
{
  // Original state (at load time, for CSV matching / revert)
  originalPosX, originalPosY, originalPosZ,
  originalRotationY, originalRotationZ,
  originalBrand, originalCount,

  // Current state
  posX, posY, posZ,
  rotationY, rotationZ,
  brand, count,

  // Change flags (drive "was modified" indicators and CSV output)
  wasMoved, wasRotated, wasBrandChanged, wasCountChanged, wasTypeChanged
}
```

## Changelog

| Date | Change |
|------|--------|
| 2026-03-03 | Generated from code analysis |
