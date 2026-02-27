import type { LocationData } from './useFixtureSelection';

/** Generate a new stable ID using built-in crypto (browser/Node 19+) with a timestamp fallback. */
function newStableId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * If loc._stableId is already set, return loc unchanged.
 * Otherwise return a new object with a freshly generated _stableId.
 * Call this ONLY during initial data load — never inside commands.
 */
export function ensureStableId(loc: LocationData): LocationData {
  if (loc._stableId) return loc;
  return { ...loc, _stableId: newStableId() };
}

/** Look up a fixture by its _stableId. Returns undefined if not found. */
export function findFixtureById(locationData: LocationData[], id: string): LocationData | undefined {
  return locationData.find(l => l._stableId === id);
}

/**
 * Apply patchFn to a single fixture by _stableId via a functional setLocationData update.
 * No-ops (same reference returned) if no item matched — avoids React re-renders.
 *
 * IMPORTANT: patchFn must return the same `loc` reference (not `{ ...loc }`) when no
 * fields actually change — the no-rerender guarantee depends on reference equality.
 */
export function updateFixtureById(
  setLocationData: React.Dispatch<React.SetStateAction<LocationData[]>>,
  id: string,
  patchFn: (loc: LocationData) => LocationData
): void {
  setLocationData(prev => {
    let didChange = false;
    const next = prev.map(item => {
      if (item._stableId !== id) return item;
      const nextItem = patchFn(item);
      if (nextItem !== item) didChange = true;
      return nextItem;
    });
    return didChange ? next : prev;
  });
}

/** Look up an architectural object by its id. Returns undefined if not found. */
export function findObjectById<T extends { id: string }>(objects: T[], id: string): T | undefined {
  return objects.find(o => o.id === id);
}

/**
 * Apply patchFn to a single architectural object by id.
 * No-ops if no item matched — avoids React re-renders.
 */
export function updateObjectById<T extends { id: string }>(
  setObjects: React.Dispatch<React.SetStateAction<T[]>>,
  id: string,
  patchFn: (obj: T) => T
): void {
  setObjects(prev => {
    let didChange = false;
    const next = prev.map(item => {
      if (item.id !== id) return item;
      const nextItem = patchFn(item);
      if (nextItem !== item) didChange = true;
      return nextItem;
    });
    return didChange ? next : prev;
  });
}
