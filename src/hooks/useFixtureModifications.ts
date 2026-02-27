import { useState, useCallback } from 'react';
import type { RefObject } from 'react';
import { type LocationData } from './useFixtureSelection';
import { type Command } from './useUndoRedo';
import { findFixtureById, updateFixtureById } from './fixtureHelpers';

// Legacy interfaces — kept for backward compatibility but no longer actively used
export interface MovedFixture {
  originalPosition: [number, number, number];
  newPosition: [number, number, number];
}

export interface RotatedFixture {
  originalRotation: [number, number, number];
  rotationOffset: number;
}

export interface ModifiedFixtureBrand {
  originalBrand: string;
  newBrand: string;
}

export interface ModifiedFixture {
  originalType: string;
  newType: string;
  newGlbUrl: string;
  newBlockName?: string;
}

export interface ModifiedFixtureCount {
  originalCount: number;
  newCount: number;
}

export interface ModifiedFixtureHierarchy {
  originalHierarchy: number;
  newHierarchy: number;
}

/** Generate a stable ID without importing uuid. */
function newStableId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export function useFixtureModifications(
  selectedLocation: LocationData | null,
  selectedLocations: LocationData[],
  selectedFloorPlate: any,
  setSelectedLocationId: React.Dispatch<React.SetStateAction<string | null>>,
  setSelectedLocationIds: React.Dispatch<React.SetStateAction<string[]>>,
  setLocationData: React.Dispatch<React.SetStateAction<LocationData[]>>,
  setSelectedFloorPlate: React.Dispatch<React.SetStateAction<any>>,
  executeCommand: (cmd: Command) => void,
  locationDataRef: RefObject<LocationData[]>
) {
  const [modifiedFloorPlates, setModifiedFloorPlates] = useState<Map<string, any>>(new Map());
  // deletedFixtures now stores _stableId values (not generateFixtureUID output)
  const [deletedFixtures, setDeletedFixtures] = useState<Set<string>>(new Set());
  const [deletedFixturePositions, setDeletedFixturePositions] = useState<Set<string>>(new Set());
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [fixturesToDelete, setFixturesToDelete] = useState<LocationData[]>([]);

  // ─── Move ─────────────────────────────────────────────────────────────────

  const handlePositionChange = useCallback((location: LocationData, newPosition: [number, number, number]) => {
    const stableId = location._stableId;
    if (!stableId) return;

    const cur = findFixtureById(locationDataRef.current!, stableId) ?? location;
    const prevX = cur.posX;
    const prevY = cur.posY;
    const prevZ = cur.posZ;
    const prevWasMoved = cur.wasMoved;
    const prevOrigX = cur.originalPosX;
    const prevOrigY = cur.originalPosY;
    const prevOrigZ = cur.originalPosZ;
    const [newX, newY, newZ] = newPosition;

    executeCommand({
      commandName: 'MoveFixture',
      do() {
        updateFixtureById(setLocationData, stableId, loc => ({
          ...loc,
          posX: newX,
          posY: newY,
          posZ: newZ,
          wasMoved: true,
          originalPosX: loc.originalPosX ?? prevX,
          originalPosY: loc.originalPosY ?? prevY,
          originalPosZ: loc.originalPosZ ?? prevZ,
        }));
      },
      undo() {
        updateFixtureById(setLocationData, stableId, loc => ({
          ...loc,
          posX: prevX,
          posY: prevY,
          posZ: prevZ,
          wasMoved: prevWasMoved,
          originalPosX: prevOrigX,
          originalPosY: prevOrigY,
          originalPosZ: prevOrigZ,
        }));
      },
    });
  }, [setLocationData, executeCommand, locationDataRef]);

  // ─── Rotate (single) ──────────────────────────────────────────────────────

  const handleRotateFixture = useCallback((degrees: number) => {
    if (!selectedLocation) return;
    const stableId = selectedLocation._stableId;
    if (!stableId) return;

    const cur = findFixtureById(locationDataRef.current!, stableId) ?? selectedLocation;
    const prevRotZ = cur.rotationZ;
    const prevWasRotated = cur.wasRotated;
    const prevOrigRotX = cur.originalRotationX;
    const prevOrigRotY = cur.originalRotationY;
    const prevOrigRotZ = cur.originalRotationZ;

    executeCommand({
      commandName: 'RotateFixture',
      do() {
        updateFixtureById(setLocationData, stableId, loc => {
          let newRotationZ = loc.rotationZ + degrees;
          newRotationZ = ((newRotationZ % 360) + 360) % 360;
          return {
            ...loc,
            rotationZ: newRotationZ,
            wasRotated: true,
            originalRotationX: loc.originalRotationX ?? loc.rotationX,
            originalRotationY: loc.originalRotationY ?? loc.rotationY,
            originalRotationZ: loc.originalRotationZ ?? loc.rotationZ,
          };
        });
      },
      undo() {
        updateFixtureById(setLocationData, stableId, loc => ({
          ...loc,
          rotationZ: prevRotZ,
          wasRotated: prevWasRotated,
          originalRotationX: prevOrigRotX,
          originalRotationY: prevOrigRotY,
          originalRotationZ: prevOrigRotZ,
        }));
      },
    });
  }, [selectedLocation, setLocationData, executeCommand, locationDataRef]);

  // ─── Rotate (multi) ───────────────────────────────────────────────────────

  const handleMultiRotateFixture = useCallback((degrees: number) => {
    const stableIds = selectedLocations.map(loc => loc._stableId).filter(Boolean) as string[];
    if (stableIds.length === 0) return;

    type RotSnapshot = {
      stableId: string;
      prevRotZ: number;
      prevWasRotated: boolean | undefined;
      prevOrigRotX: number | undefined;
      prevOrigRotY: number | undefined;
      prevOrigRotZ: number | undefined;
    };

    const snapshots: RotSnapshot[] = stableIds.map(id => {
      const loc = findFixtureById(locationDataRef.current!, id);
      return {
        stableId: id,
        prevRotZ: loc?.rotationZ ?? 0,
        prevWasRotated: loc?.wasRotated,
        prevOrigRotX: loc?.originalRotationX,
        prevOrigRotY: loc?.originalRotationY,
        prevOrigRotZ: loc?.originalRotationZ,
      };
    });

    const stableIdSet = new Set(stableIds);

    executeCommand({
      commandName: 'RotateFixture',
      do() {
        setLocationData(prev => prev.map(loc => {
          if (!loc._stableId || !stableIdSet.has(loc._stableId)) return loc;
          let newRotationZ = loc.rotationZ + degrees;
          newRotationZ = ((newRotationZ % 360) + 360) % 360;
          return {
            ...loc,
            rotationZ: newRotationZ,
            wasRotated: true,
            originalRotationX: loc.originalRotationX ?? loc.rotationX,
            originalRotationY: loc.originalRotationY ?? loc.rotationY,
            originalRotationZ: loc.originalRotationZ ?? loc.rotationZ,
          };
        }));
      },
      undo() {
        const prevMap = new Map(snapshots.map(s => [s.stableId, s]));
        setLocationData(prev => prev.map(loc => {
          if (!loc._stableId) return loc;
          const saved = prevMap.get(loc._stableId);
          if (!saved) return loc;
          return {
            ...loc,
            rotationZ: saved.prevRotZ,
            wasRotated: saved.prevWasRotated,
            originalRotationX: saved.prevOrigRotX,
            originalRotationY: saved.prevOrigRotY,
            originalRotationZ: saved.prevOrigRotZ,
          };
        }));
      },
    });
  }, [selectedLocations, setLocationData, executeCommand, locationDataRef]);

  // ─── Move multi ───────────────────────────────────────────────────────────

  const handleMultiPositionChange = useCallback((delta: [number, number, number]) => {
    const stableIds = selectedLocations.map(loc => loc._stableId).filter(Boolean) as string[];
    if (stableIds.length === 0) return;

    type PosSnapshot = {
      stableId: string;
      prevX: number; prevY: number; prevZ: number;
      newX: number; newY: number; newZ: number;
      prevWasMoved: boolean | undefined;
      prevOrigX: number | undefined;
      prevOrigY: number | undefined;
      prevOrigZ: number | undefined;
    };

    const snapshots: PosSnapshot[] = stableIds.map(id => {
      const loc = findFixtureById(locationDataRef.current!, id);
      const px = loc?.posX ?? 0;
      const py = loc?.posY ?? 0;
      const pz = loc?.posZ ?? 0;
      return {
        stableId: id,
        prevX: px, prevY: py, prevZ: pz,
        newX: px + delta[0], newY: py + delta[1], newZ: pz + delta[2],
        prevWasMoved: loc?.wasMoved,
        prevOrigX: loc?.originalPosX,
        prevOrigY: loc?.originalPosY,
        prevOrigZ: loc?.originalPosZ,
      };
    });

    const doMap = new Map(snapshots.map(s => [s.stableId, s]));

    executeCommand({
      commandName: 'MoveFixtures',
      do() {
        setLocationData(prev => prev.map(loc => {
          if (!loc._stableId) return loc;
          const data = doMap.get(loc._stableId);
          if (!data) return loc;
          return {
            ...loc,
            posX: data.newX,
            posY: data.newY,
            posZ: data.newZ,
            wasMoved: true,
            originalPosX: loc.originalPosX ?? data.prevX,
            originalPosY: loc.originalPosY ?? data.prevY,
            originalPosZ: loc.originalPosZ ?? data.prevZ,
          };
        }));
      },
      undo() {
        setLocationData(prev => prev.map(loc => {
          if (!loc._stableId) return loc;
          const data = doMap.get(loc._stableId);
          if (!data) return loc;
          return {
            ...loc,
            posX: data.prevX,
            posY: data.prevY,
            posZ: data.prevZ,
            wasMoved: data.prevWasMoved,
            originalPosX: data.prevOrigX,
            originalPosY: data.prevOrigY,
            originalPosZ: data.prevOrigZ,
          };
        }));
      },
    });
  }, [selectedLocations, setLocationData, executeCommand, locationDataRef]);

  // ─── Reset (single) ───────────────────────────────────────────────────────

  const handleResetPosition = useCallback((location: LocationData) => {
    const stableId = location._stableId;
    if (!stableId) return;

    const cur = findFixtureById(locationDataRef.current!, stableId) ?? location;

    // Capture all current fields that reset will change
    const prevPosX = cur.posX;
    const prevPosY = cur.posY;
    const prevPosZ = cur.posZ;
    const prevRotX = cur.rotationX;
    const prevRotY = cur.rotationY;
    const prevRotZ = cur.rotationZ;
    const prevBrand = cur.brand;
    const prevBlockName = cur.blockName;
    const prevGlbUrl = cur.glbUrl;
    const prevCount = cur.count;
    const prevHierarchy = cur.hierarchy;
    const prevWasMoved = cur.wasMoved;
    const prevWasRotated = cur.wasRotated;
    const prevWasTypeChanged = cur.wasTypeChanged;
    const prevWasBrandChanged = cur.wasBrandChanged;
    const prevWasCountChanged = cur.wasCountChanged;
    const prevWasHierarchyChanged = cur.wasHierarchyChanged;
    const prevOrigPosX = cur.originalPosX;
    const prevOrigPosY = cur.originalPosY;
    const prevOrigPosZ = cur.originalPosZ;
    const prevOrigRotX = cur.originalRotationX;
    const prevOrigRotY = cur.originalRotationY;
    const prevOrigRotZ = cur.originalRotationZ;
    const prevOrigBrand = cur.originalBrand;
    const prevOrigBlockName = cur.originalBlockName;
    const prevOrigGlbUrl = cur.originalGlbUrl;
    const prevOrigCount = cur.originalCount;
    const prevOrigHierarchy = cur.originalHierarchy;

    executeCommand({
      commandName: 'ResetFixture',
      do() {
        updateFixtureById(setLocationData, stableId, loc => ({
          ...loc,
          posX: loc.originalPosX ?? loc.posX,
          posY: loc.originalPosY ?? loc.posY,
          posZ: loc.originalPosZ ?? loc.posZ,
          rotationX: loc.originalRotationX ?? loc.rotationX,
          rotationY: loc.originalRotationY ?? loc.rotationY,
          rotationZ: loc.originalRotationZ ?? loc.rotationZ,
          blockName: loc.originalBlockName ?? loc.blockName,
          brand: loc.originalBrand ?? loc.brand,
          count: loc.originalCount ?? loc.count,
          hierarchy: loc.originalHierarchy ?? loc.hierarchy,
          wasMoved: false,
          wasRotated: false,
          wasTypeChanged: false,
          wasBrandChanged: false,
          wasCountChanged: false,
          wasHierarchyChanged: false,
        }));
      },
      undo() {
        updateFixtureById(setLocationData, stableId, loc => ({
          ...loc,
          posX: prevPosX,
          posY: prevPosY,
          posZ: prevPosZ,
          rotationX: prevRotX,
          rotationY: prevRotY,
          rotationZ: prevRotZ,
          brand: prevBrand,
          blockName: prevBlockName,
          glbUrl: prevGlbUrl,
          count: prevCount,
          hierarchy: prevHierarchy,
          wasMoved: prevWasMoved,
          wasRotated: prevWasRotated,
          wasTypeChanged: prevWasTypeChanged,
          wasBrandChanged: prevWasBrandChanged,
          wasCountChanged: prevWasCountChanged,
          wasHierarchyChanged: prevWasHierarchyChanged,
          originalPosX: prevOrigPosX,
          originalPosY: prevOrigPosY,
          originalPosZ: prevOrigPosZ,
          originalRotationX: prevOrigRotX,
          originalRotationY: prevOrigRotY,
          originalRotationZ: prevOrigRotZ,
          originalBrand: prevOrigBrand,
          originalBlockName: prevOrigBlockName,
          originalGlbUrl: prevOrigGlbUrl,
          originalCount: prevOrigCount,
          originalHierarchy: prevOrigHierarchy,
        }));
      },
    });
  }, [setLocationData, executeCommand, locationDataRef]);

  // ─── Reset (multi) ────────────────────────────────────────────────────────

  const handleResetMultiplePositions = useCallback((locations: LocationData[]) => {
    type ResetSnapshot = {
      stableId: string;
      prevPosX: number; prevPosY: number; prevPosZ: number;
      prevRotX: number; prevRotY: number; prevRotZ: number;
      prevBrand: string; prevBlockName: string; prevGlbUrl?: string;
      prevCount: number; prevHierarchy: number;
      prevWasMoved?: boolean; prevWasRotated?: boolean; prevWasTypeChanged?: boolean;
      prevWasBrandChanged?: boolean; prevWasCountChanged?: boolean; prevWasHierarchyChanged?: boolean;
      prevOrigPosX?: number; prevOrigPosY?: number; prevOrigPosZ?: number;
      prevOrigRotX?: number; prevOrigRotY?: number; prevOrigRotZ?: number;
      prevOrigBrand?: string; prevOrigBlockName?: string; prevOrigGlbUrl?: string;
      prevOrigCount?: number; prevOrigHierarchy?: number;
    };

    const snapshots: ResetSnapshot[] = locations.map(loc => {
      const cur = findFixtureById(locationDataRef.current!, loc._stableId) ?? loc;
      return {
        stableId: loc._stableId,
        prevPosX: cur.posX, prevPosY: cur.posY, prevPosZ: cur.posZ,
        prevRotX: cur.rotationX, prevRotY: cur.rotationY, prevRotZ: cur.rotationZ,
        prevBrand: cur.brand, prevBlockName: cur.blockName, prevGlbUrl: cur.glbUrl,
        prevCount: cur.count, prevHierarchy: cur.hierarchy,
        prevWasMoved: cur.wasMoved, prevWasRotated: cur.wasRotated, prevWasTypeChanged: cur.wasTypeChanged,
        prevWasBrandChanged: cur.wasBrandChanged, prevWasCountChanged: cur.wasCountChanged, prevWasHierarchyChanged: cur.wasHierarchyChanged,
        prevOrigPosX: cur.originalPosX, prevOrigPosY: cur.originalPosY, prevOrigPosZ: cur.originalPosZ,
        prevOrigRotX: cur.originalRotationX, prevOrigRotY: cur.originalRotationY, prevOrigRotZ: cur.originalRotationZ,
        prevOrigBrand: cur.originalBrand, prevOrigBlockName: cur.originalBlockName, prevOrigGlbUrl: cur.originalGlbUrl,
        prevOrigCount: cur.originalCount, prevOrigHierarchy: cur.originalHierarchy,
      };
    });

    const stableIdSet = new Set(snapshots.map(s => s.stableId));
    const prevMap = new Map(snapshots.map(s => [s.stableId, s]));

    executeCommand({
      commandName: 'ResetFixtures',
      do() {
        setLocationData(prev => prev.map(loc => {
          if (!loc._stableId || !stableIdSet.has(loc._stableId)) return loc;
          return {
            ...loc,
            posX: loc.originalPosX ?? loc.posX,
            posY: loc.originalPosY ?? loc.posY,
            posZ: loc.originalPosZ ?? loc.posZ,
            rotationX: loc.originalRotationX ?? loc.rotationX,
            rotationY: loc.originalRotationY ?? loc.rotationY,
            rotationZ: loc.originalRotationZ ?? loc.rotationZ,
            blockName: loc.originalBlockName ?? loc.blockName,
            brand: loc.originalBrand ?? loc.brand,
            count: loc.originalCount ?? loc.count,
            hierarchy: loc.originalHierarchy ?? loc.hierarchy,
            wasMoved: false,
            wasRotated: false,
            wasTypeChanged: false,
            wasBrandChanged: false,
            wasCountChanged: false,
            wasHierarchyChanged: false,
          };
        }));
        setSelectedLocationId(null);
        setSelectedLocationIds([]);
      },
      undo() {
        setLocationData(prev => prev.map(loc => {
          if (!loc._stableId) return loc;
          const saved = prevMap.get(loc._stableId);
          if (!saved) return loc;
          return {
            ...loc,
            posX: saved.prevPosX, posY: saved.prevPosY, posZ: saved.prevPosZ,
            rotationX: saved.prevRotX, rotationY: saved.prevRotY, rotationZ: saved.prevRotZ,
            brand: saved.prevBrand, blockName: saved.prevBlockName, glbUrl: saved.prevGlbUrl,
            count: saved.prevCount, hierarchy: saved.prevHierarchy,
            wasMoved: saved.prevWasMoved, wasRotated: saved.prevWasRotated, wasTypeChanged: saved.prevWasTypeChanged,
            wasBrandChanged: saved.prevWasBrandChanged, wasCountChanged: saved.prevWasCountChanged, wasHierarchyChanged: saved.prevWasHierarchyChanged,
            originalPosX: saved.prevOrigPosX, originalPosY: saved.prevOrigPosY, originalPosZ: saved.prevOrigPosZ,
            originalRotationX: saved.prevOrigRotX, originalRotationY: saved.prevOrigRotY, originalRotationZ: saved.prevOrigRotZ,
            originalBrand: saved.prevOrigBrand, originalBlockName: saved.prevOrigBlockName, originalGlbUrl: saved.prevOrigGlbUrl,
            originalCount: saved.prevOrigCount, originalHierarchy: saved.prevOrigHierarchy,
          };
        }));
        // Rule 1 — no selection restore on undo of reset; selection was cleared in do()
      },
    });
  }, [setLocationData, setSelectedLocationId, setSelectedLocationIds, executeCommand, locationDataRef]);

  // ─── Floor brand change ───────────────────────────────────────────────────

  const handleBrandChange = useCallback((newBrand: string) => {
    if (!selectedFloorPlate) return;

    const plateKey = selectedFloorPlate.meshName || `${selectedFloorPlate.surfaceId}-${selectedFloorPlate.brand}`;
    const newEntry = {
      ...selectedFloorPlate,
      brand: newBrand,
      originalBrand: selectedFloorPlate.originalBrand || selectedFloorPlate.brand
    };

    // Capture prev synchronously before any state changes
    let capturedPrevEntry: any = undefined;
    setModifiedFloorPlates(prev => {
      capturedPrevEntry = prev.has(plateKey) ? Object.freeze({ ...prev.get(plateKey) }) : undefined;
      return prev; // no-op read
    });
    // Since setModifiedFloorPlates is async, we read the ref-like value directly from closure
    // Actually we need to read from current modifiedFloorPlates...
    // We capture via a ref pattern instead — see below

    executeCommand({
      commandName: 'FloorBrandChange',
      do() {
        setModifiedFloorPlates(prev => {
          const newMap = new Map(prev);
          newMap.set(plateKey, newEntry);
          return newMap;
        });
        setSelectedFloorPlate((prev: any) => prev ? { ...prev, brand: newBrand } : null);
      },
      undo() {
        setModifiedFloorPlates(prev => {
          const newMap = new Map(prev);
          if (capturedPrevEntry === undefined) {
            newMap.delete(plateKey);
          } else {
            newMap.set(plateKey, capturedPrevEntry);
          }
          return newMap;
        });
        setSelectedFloorPlate((prev: any) => {
          if (!prev) return null;
          return { ...prev, brand: capturedPrevEntry?.brand ?? selectedFloorPlate.brand };
        });
      },
    });
  }, [selectedFloorPlate, setSelectedFloorPlate, executeCommand]);

  // ─── Fixture brand change ─────────────────────────────────────────────────

  const handleFixtureBrandChange = useCallback((newBrand: string) => {
    // Collect targets: prefer selectedLocations (includes single too), fall back to selectedLocation
    const targets = selectedLocations.length > 0
      ? selectedLocations
      : (selectedLocation ? [selectedLocation] : []);
    if (targets.length === 0) return;

    type BrandSnapshot = {
      stableId: string;
      prevBrand: string;
      prevWasBrandChanged?: boolean;
      prevOriginalBrand?: string;
    };

    const snapshots: BrandSnapshot[] = targets.map(loc => {
      const cur = findFixtureById(locationDataRef.current!, loc._stableId) ?? loc;
      return {
        stableId: loc._stableId,
        prevBrand: cur.brand,
        prevWasBrandChanged: cur.wasBrandChanged,
        prevOriginalBrand: cur.originalBrand,
      };
    });

    const stableIdSet = new Set(snapshots.map(s => s.stableId));
    const prevMap = new Map(snapshots.map(s => [s.stableId, s]));

    executeCommand({
      commandName: 'BrandChange',
      do() {
        setLocationData(prev => prev.map(loc => {
          if (!loc._stableId || !stableIdSet.has(loc._stableId)) return loc;
          return {
            ...loc,
            brand: newBrand,
            wasBrandChanged: true,
            originalBrand: loc.originalBrand ?? loc.brand,
          };
        }));
      },
      undo() {
        setLocationData(prev => prev.map(loc => {
          if (!loc._stableId) return loc;
          const saved = prevMap.get(loc._stableId);
          if (!saved) return loc;
          return {
            ...loc,
            brand: saved.prevBrand,
            wasBrandChanged: saved.prevWasBrandChanged,
            originalBrand: saved.prevOriginalBrand,
          };
        }));
      },
    });
  }, [selectedLocation, selectedLocations, setLocationData, executeCommand, locationDataRef]);

  // ─── Fixture count change (single) ────────────────────────────────────────

  const handleFixtureCountChange = useCallback((location: LocationData, newCount: number) => {
    const stableId = location._stableId;
    if (!stableId) return;
    const cur = findFixtureById(locationDataRef.current!, stableId) ?? location;
    const prevCount = cur.count;
    const prevWasCountChanged = cur.wasCountChanged;
    const prevOriginalCount = cur.originalCount;

    executeCommand({
      commandName: 'CountChange',
      do() {
        updateFixtureById(setLocationData, stableId, loc => ({
          ...loc,
          count: newCount,
          wasCountChanged: true,
          originalCount: loc.originalCount ?? loc.count,
        }));
      },
      undo() {
        updateFixtureById(setLocationData, stableId, loc => ({
          ...loc,
          count: prevCount,
          wasCountChanged: prevWasCountChanged,
          originalCount: prevOriginalCount,
        }));
      },
    });
  }, [setLocationData, executeCommand, locationDataRef]);

  // ─── Fixture count change (multi) ─────────────────────────────────────────

  const handleFixtureCountChangeMulti = useCallback((locations: LocationData[], newCount: number) => {
    type CountSnapshot = { stableId: string; prevCount: number; prevWasCountChanged?: boolean; prevOriginalCount?: number };

    const snapshots: CountSnapshot[] = locations.map(loc => {
      const cur = findFixtureById(locationDataRef.current!, loc._stableId) ?? loc;
      return {
        stableId: loc._stableId,
        prevCount: cur.count,
        prevWasCountChanged: cur.wasCountChanged,
        prevOriginalCount: cur.originalCount,
      };
    });

    const stableIdSet = new Set(snapshots.map(s => s.stableId));
    const prevMap = new Map(snapshots.map(s => [s.stableId, s]));

    executeCommand({
      commandName: 'CountChange',
      do() {
        setLocationData(prev => prev.map(loc => {
          if (!loc._stableId || !stableIdSet.has(loc._stableId)) return loc;
          return {
            ...loc,
            count: newCount,
            wasCountChanged: true,
            originalCount: loc.originalCount ?? loc.count,
          };
        }));
      },
      undo() {
        setLocationData(prev => prev.map(loc => {
          if (!loc._stableId) return loc;
          const saved = prevMap.get(loc._stableId);
          if (!saved) return loc;
          return {
            ...loc,
            count: saved.prevCount,
            wasCountChanged: saved.prevWasCountChanged,
            originalCount: saved.prevOriginalCount,
          };
        }));
      },
    });
  }, [setLocationData, executeCommand, locationDataRef]);

  // ─── Fixture hierarchy change (single) ────────────────────────────────────

  const handleFixtureHierarchyChange = useCallback((location: LocationData, newHierarchy: number) => {
    const stableId = location._stableId;
    if (!stableId) return;
    const cur = findFixtureById(locationDataRef.current!, stableId) ?? location;
    const prevHierarchy = cur.hierarchy;
    const prevWasHierarchyChanged = cur.wasHierarchyChanged;
    const prevOriginalHierarchy = cur.originalHierarchy;

    executeCommand({
      commandName: 'HierarchyChange',
      do() {
        updateFixtureById(setLocationData, stableId, loc => ({
          ...loc,
          hierarchy: newHierarchy,
          wasHierarchyChanged: true,
          originalHierarchy: loc.originalHierarchy ?? loc.hierarchy,
        }));
      },
      undo() {
        updateFixtureById(setLocationData, stableId, loc => ({
          ...loc,
          hierarchy: prevHierarchy,
          wasHierarchyChanged: prevWasHierarchyChanged,
          originalHierarchy: prevOriginalHierarchy,
        }));
      },
    });
  }, [setLocationData, executeCommand, locationDataRef]);

  // ─── Duplicate ────────────────────────────────────────────────────────────

  const handleDuplicateFixture = useCallback((location: LocationData) => {
    const currentData = locationDataRef.current!;

    // Compute hierarchy at command-creation time
    const currentFloorFixtures = currentData.filter(loc =>
      loc.floorIndex === location.floorIndex && !loc.forDelete
    );
    const maxHierarchy = currentFloorFixtures.length > 0
      ? Math.max(...currentFloorFixtures.map(loc => loc.hierarchy))
      : 0;
    const newHierarchy = maxHierarchy + 1;

    const dupStableId = newStableId(); // creation site — inline assignment
    const dupTimestamp = Date.now() + Math.random() * 1000;

    const duplicatedFixture: LocationData = {
      ...location,
      _stableId: dupStableId,
      hierarchy: newHierarchy,
      wasMoved: false,
      wasRotated: false,
      wasTypeChanged: false,
      wasBrandChanged: false,
      wasCountChanged: false,
      wasHierarchyChanged: false,
      wasDuplicated: true,
      originalPosX: location.posX,
      originalPosY: location.posY,
      originalPosZ: location.posZ,
      originalRotationX: location.rotationX,
      originalRotationY: location.rotationY,
      originalRotationZ: location.rotationZ,
      originalBlockName: location.blockName,
      originalBrand: location.brand,
      originalCount: location.count,
      originalHierarchy: newHierarchy,
      originalGlbUrl: location.glbUrl,
      _updateTimestamp: dupTimestamp,
      _ingestionTimestamp: dupTimestamp,
    };

    executeCommand({
      commandName: 'DuplicateFixture',
      do() {
        setLocationData(prev => [...prev, duplicatedFixture]);
        setSelectedLocationId(dupStableId);
        setSelectedLocationIds([dupStableId]);
      },
      undo() {
        setLocationData(prev => prev.filter(loc => loc._stableId !== dupStableId));
        // Rule 3 — clear selection only if still pointing at the duplicate
        setSelectedLocationId(cur => cur === dupStableId ? null : cur);
        setSelectedLocationIds(cur =>
          cur.length === 1 && cur[0] === dupStableId ? [] : cur
        );
      },
    });
  }, [setLocationData, setSelectedLocationId, setSelectedLocationIds, executeCommand, locationDataRef]);

  // ─── Delete (dialog open helpers) ────────────────────────────────────────

  const handleDeleteFixture = useCallback((location: LocationData) => {
    setFixturesToDelete([location]);
    setDeleteConfirmationOpen(true);
  }, []);

  const handleDeleteFixtures = useCallback((locations: LocationData[]) => {
    setFixturesToDelete(locations);
    setDeleteConfirmationOpen(true);
  }, []);

  // ─── Confirm delete ───────────────────────────────────────────────────────

  const handleConfirmDelete = useCallback(() => {
    const prevSelectedId = selectedLocation?._stableId ?? null;
    const prevSelectedIds = selectedLocations.map(loc => loc._stableId);

    type DeleteItem = { stableId: string; positionKey: string | null };

    const deletionItems: DeleteItem[] = fixturesToDelete.map(location => {
      const stableId = location._stableId;

      // Stability guard for positionKeys
      let positionKey: string | null = null;
      if (
        location.originalBlockName != null &&
        location.originalPosX != null &&
        location.originalPosY != null &&
        location.originalPosZ != null
      ) {
        positionKey = `${location.originalBlockName}-${location.originalPosX.toFixed(3)}-${location.originalPosY.toFixed(3)}-${location.originalPosZ.toFixed(3)}`;
      }

      return { stableId, positionKey };
    });

    const stableIds = deletionItems.map(d => d.stableId);
    const nonNullPositionKeys = deletionItems.map(d => d.positionKey).filter(k => k !== null) as string[];

    executeCommand({
      commandName: 'DeleteFixture',
      do() {
        setDeletedFixtures(prev => new Set([...prev, ...stableIds]));
        if (nonNullPositionKeys.length > 0) {
          setDeletedFixturePositions(prev => new Set([...prev, ...nonNullPositionKeys]));
        }
        // Rule 2 — clear selection for deleted fixtures
        setSelectedLocationId(cur => stableIds.includes(cur ?? '') ? null : cur);
        setSelectedLocationIds(cur => cur.filter(id => !stableIds.includes(id)));
      },
      undo() {
        setDeletedFixtures(prev => {
          const next = new Set(prev);
          stableIds.forEach(id => next.delete(id));
          return next;
        });
        if (nonNullPositionKeys.length > 0) {
          setDeletedFixturePositions(prev => {
            const next = new Set(prev);
            nonNullPositionKeys.forEach(k => next.delete(k));
            return next;
          });
        }
        // Rule 2 — restore selection filtered to existing
        const restoredIds = prevSelectedIds.filter(id =>
          locationDataRef.current!.some(loc => loc._stableId === id)
        );
        setSelectedLocationId(
          restoredIds.includes(prevSelectedId ?? '') ? prevSelectedId : null
        );
        setSelectedLocationIds(restoredIds);
      },
    });

    setDeleteConfirmationOpen(false);
    setFixturesToDelete([]);
  }, [
    fixturesToDelete,
    selectedLocation,
    selectedLocations,
    setSelectedLocationId,
    setSelectedLocationIds,
    executeCommand,
    locationDataRef,
  ]);

  // ─── Split ────────────────────────────────────────────────────────────────

  const handleSplitFixture = useCallback((location: LocationData, leftCount: number, rightCount: number) => {
    const originalStableId = location._stableId;
    if (!originalStableId) return;

    const prevSelectedId = selectedLocation?._stableId ?? null;
    const prevSelectedIds = selectedLocations.map(loc => loc._stableId);

    const fixtureLength = 0.6;
    const originalTotalLength = location.count * fixtureLength;
    const leftSegmentLength = leftCount * fixtureLength;
    const rightSegmentLength = rightCount * fixtureLength;
    const leftMidpointOffset = (-originalTotalLength / 2) + (leftSegmentLength / 2);
    const rightMidpointOffset = (-originalTotalLength / 2) + leftSegmentLength + (rightSegmentLength / 2);
    const rotationZ_rad = (location.rotationZ * Math.PI) / 180;
    const leftGroupX = location.posX + (leftMidpointOffset * Math.cos(rotationZ_rad));
    const leftGroupY = location.posY + (leftMidpointOffset * Math.sin(rotationZ_rad));
    const rightGroupX = location.posX + (rightMidpointOffset * Math.cos(rotationZ_rad));
    const rightGroupY = location.posY + (rightMidpointOffset * Math.sin(rotationZ_rad));

    const currentData = locationDataRef.current!;
    const currentFloorFixtures = currentData.filter(loc =>
      loc.floorIndex === location.floorIndex && !loc.forDelete
    );
    const maxHierarchy = currentFloorFixtures.length > 0
      ? Math.max(...currentFloorFixtures.map(loc => loc.hierarchy))
      : 0;
    const leftHierarchy = maxHierarchy + 1;
    const rightHierarchy = maxHierarchy + 2;

    const leftStableId = newStableId();
    const rightStableId = newStableId();
    const leftTimestamp = Date.now() + Math.floor(Math.random() * 10000);
    const rightTimestamp = Date.now() + 50000 + Math.floor(Math.random() * 10000);

    const leftSplitFixture: LocationData = {
      ...location,
      _stableId: leftStableId,
      posX: leftGroupX,
      posY: leftGroupY,
      posZ: location.posZ,
      count: leftCount,
      hierarchy: leftHierarchy,
      wasSplit: true,
      originalCount: leftCount,
      originalHierarchy: leftHierarchy,
      _updateTimestamp: leftTimestamp,
      _ingestionTimestamp: leftTimestamp,
      wasMoved: false,
      wasRotated: false,
      wasTypeChanged: false,
      wasBrandChanged: false,
      wasCountChanged: false,
      wasHierarchyChanged: false,
      wasDuplicated: false,
    };

    const rightSplitFixture: LocationData = {
      ...location,
      _stableId: rightStableId,
      posX: rightGroupX,
      posY: rightGroupY,
      posZ: location.posZ,
      count: rightCount,
      hierarchy: rightHierarchy,
      wasSplit: true,
      originalCount: rightCount,
      originalHierarchy: rightHierarchy,
      _updateTimestamp: rightTimestamp,
      _ingestionTimestamp: rightTimestamp,
      wasMoved: false,
      wasRotated: false,
      wasTypeChanged: false,
      wasBrandChanged: false,
      wasCountChanged: false,
      wasHierarchyChanged: false,
      wasDuplicated: false,
    };

    executeCommand({
      commandName: 'SplitFixture',
      do() {
        setLocationData(prev => {
          const withMarkedOriginal = prev.map(loc =>
            loc._stableId === originalStableId ? { ...loc, forDelete: true } : loc
          );
          return [...withMarkedOriginal, leftSplitFixture, rightSplitFixture];
        });
        setSelectedLocationId(null);
        setSelectedLocationIds([]);
      },
      undo() {
        setLocationData(prev => {
          const withoutSplit = prev.filter(loc =>
            loc._stableId !== leftStableId && loc._stableId !== rightStableId
          );
          return withoutSplit.map(loc =>
            loc._stableId === originalStableId ? { ...loc, forDelete: false } : loc
          );
        });
        // Rule 2 — restore selection filtered to existing
        const restoredIds = prevSelectedIds.filter(id =>
          locationDataRef.current!.some(loc => loc._stableId === id)
        );
        setSelectedLocationId(
          restoredIds.includes(prevSelectedId ?? '') ? prevSelectedId : null
        );
        setSelectedLocationIds(restoredIds);
      },
    });
  }, [selectedLocation, selectedLocations, setLocationData, setSelectedLocationId, setSelectedLocationIds, executeCommand, locationDataRef]);

  // ─── canMergeFixtures ──────────────────────────────────────────────────────

  const canMergeFixtures = useCallback((fixtures: LocationData[], fixtureTypeMap: Map<string, string>): boolean => {
    if (fixtures.length !== 2) return false;
    const [fixtureA, fixtureB] = fixtures;
    const typeA = fixtureTypeMap.get(fixtureA.blockName);
    const typeB = fixtureTypeMap.get(fixtureB.blockName);
    if (typeA !== "WALL-BAY" || typeB !== "WALL-BAY") return false;
    const rotationDiff = Math.abs(fixtureA.rotationZ - fixtureB.rotationZ);
    if (rotationDiff > 1 && rotationDiff < 359) return false;
    const fixtureLength = 0.6;
    const rotationZ = (fixtureA.rotationZ * Math.PI) / 180;
    const cosRot = Math.cos(rotationZ);
    const sinRot = Math.sin(rotationZ);
    const tolerance = 0.2;
    const projA = fixtureA.posX * cosRot + fixtureA.posY * sinRot;
    const projB = fixtureB.posX * cosRot + fixtureB.posY * sinRot;
    const aLeftEdge = projA - (fixtureA.count * fixtureLength * 0.5);
    const aRightEdge = projA + (fixtureA.count * fixtureLength * 0.5);
    const bLeftEdge = projB - (fixtureB.count * fixtureLength * 0.5);
    const bRightEdge = projB + (fixtureB.count * fixtureLength * 0.5);
    const gapAB = Math.abs(aRightEdge - bLeftEdge);
    const gapBA = Math.abs(bRightEdge - aLeftEdge);
    const perpA = -fixtureA.posX * sinRot + fixtureA.posY * cosRot;
    const perpB = -fixtureB.posX * sinRot + fixtureB.posY * cosRot;
    const perpGap = Math.abs(perpA - perpB);
    return (gapAB < tolerance || gapBA < tolerance) && perpGap < tolerance;
  }, []);

  // ─── Merge ────────────────────────────────────────────────────────────────

  const handleMergeFixtures = useCallback((fixtures: LocationData[]) => {
    if (fixtures.length !== 2) return;
    const [fixtureA, fixtureB] = fixtures;

    const stableIdA = fixtureA._stableId;
    const stableIdB = fixtureB._stableId;
    if (!stableIdA || !stableIdB) return;

    const prevSelectedId = selectedLocation?._stableId ?? null;
    const prevSelectedIds = selectedLocations.map(loc => loc._stableId);

    // Stability guard for positionKeys
    let positionKeyA: string | null = null;
    if (
      fixtureA.originalBlockName != null &&
      fixtureA.originalPosX != null &&
      fixtureA.originalPosY != null &&
      fixtureA.originalPosZ != null
    ) {
      positionKeyA = `${fixtureA.originalBlockName}-${fixtureA.originalPosX.toFixed(3)}-${fixtureA.originalPosY.toFixed(3)}-${fixtureA.originalPosZ.toFixed(3)}`;
    }

    let positionKeyB: string | null = null;
    if (
      fixtureB.originalBlockName != null &&
      fixtureB.originalPosX != null &&
      fixtureB.originalPosY != null &&
      fixtureB.originalPosZ != null
    ) {
      positionKeyB = `${fixtureB.originalBlockName}-${fixtureB.originalPosX.toFixed(3)}-${fixtureB.originalPosY.toFixed(3)}-${fixtureB.originalPosZ.toFixed(3)}`;
    }

    const nonNullPositionKeys = [positionKeyA, positionKeyB].filter(k => k !== null) as string[];

    // Frozen snapshots of A and B for undo restoration
    const snapA = Object.freeze({ ...fixtureA });
    const snapB = Object.freeze({ ...fixtureB });

    // Calculate merged position
    const totalCount = fixtureA.count + fixtureB.count;
    const fixtureLength = 0.6;
    const rotationZ_rad = (fixtureA.rotationZ * Math.PI) / 180;
    const cosRot = Math.cos(rotationZ_rad);
    const sinRot = Math.sin(rotationZ_rad);
    const projectionA = fixtureA.posX * cosRot + fixtureA.posY * sinRot;
    const projectionB = fixtureB.posX * cosRot + fixtureB.posY * sinRot;
    const leftFixture = projectionA < projectionB ? fixtureA : fixtureB;
    const totalSpan = totalCount * fixtureLength;
    const leftEdgeX = leftFixture.posX - (leftFixture.count * fixtureLength * 0.5 * cosRot);
    const leftEdgeY = leftFixture.posY - (leftFixture.count * fixtureLength * 0.5 * sinRot);
    const centerX = leftEdgeX + (totalSpan * 0.5 * cosRot);
    const centerY = leftEdgeY + (totalSpan * 0.5 * sinRot);

    const currentData = locationDataRef.current!;
    const currentFloorFixtures = currentData.filter(loc =>
      loc.floorIndex === fixtureA.floorIndex && !loc.forDelete
    );
    const maxHierarchy = currentFloorFixtures.length > 0
      ? Math.max(...currentFloorFixtures.map(loc => loc.hierarchy))
      : 0;
    const newHierarchy = maxHierarchy + 1;
    const mergedTimestamp = Date.now() + Math.floor(Math.random() * 10000);
    const mergedStableId = newStableId();

    const mergedFixture: LocationData = {
      ...fixtureA,
      _stableId: mergedStableId,
      posX: centerX,
      posY: centerY,
      count: totalCount,
      hierarchy: newHierarchy,
      wasMerged: true,
      originalCount: totalCount,
      originalHierarchy: newHierarchy,
      _updateTimestamp: mergedTimestamp,
      _ingestionTimestamp: mergedTimestamp,
      wasMoved: false,
      wasRotated: false,
      wasTypeChanged: false,
      wasBrandChanged: false,
      wasCountChanged: false,
      wasHierarchyChanged: false,
      wasDuplicated: false,
      wasSplit: false,
    };

    executeCommand({
      commandName: 'MergeFixtures',
      do() {
        setDeletedFixtures(prev => new Set([...prev, stableIdA, stableIdB]));
        setLocationData(prev => {
          const withoutOriginals = prev.filter(loc =>
            loc._stableId !== stableIdA && loc._stableId !== stableIdB
          );
          return [...withoutOriginals, mergedFixture];
        });
        if (nonNullPositionKeys.length > 0) {
          setDeletedFixturePositions(prev => new Set([...prev, ...nonNullPositionKeys]));
        }
        setSelectedLocationId(null);
        setSelectedLocationIds([]);
      },
      undo() {
        setDeletedFixtures(prev => {
          const next = new Set(prev);
          next.delete(stableIdA);
          next.delete(stableIdB);
          return next;
        });
        setLocationData(prev => {
          const withoutMerged = prev.filter(loc => loc._stableId !== mergedStableId);
          return [...withoutMerged, snapA, snapB];
        });
        if (nonNullPositionKeys.length > 0) {
          setDeletedFixturePositions(prev => {
            const next = new Set(prev);
            nonNullPositionKeys.forEach(k => next.delete(k));
            return next;
          });
        }
        // Rule 2 — restore selection filtered to existing
        const restoredIds = prevSelectedIds.filter(id =>
          locationDataRef.current!.some(loc => loc._stableId === id)
        );
        setSelectedLocationId(
          restoredIds.includes(prevSelectedId ?? '') ? prevSelectedId : null
        );
        setSelectedLocationIds(restoredIds);
      },
    });
  }, [selectedLocation, selectedLocations, setLocationData, setSelectedLocationId, setSelectedLocationIds, executeCommand, locationDataRef]);

  // ─── Align ────────────────────────────────────────────────────────────────

  const handleAlignFixtures = useCallback((
    fixtures: LocationData[],
    alignment: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom',
    _transformSpace: 'world' | 'local'
  ) => {
    if (fixtures.length < 2) return;

    const newPositions = new Map<string, [number, number, number]>();
    let targetValue: number;

    if (alignment === 'left') {
      targetValue = Math.min(...fixtures.map(f => f.posX));
      fixtures.forEach(f => newPositions.set(f._stableId, [targetValue, f.posY, f.posZ]));
    } else if (alignment === 'center-h') {
      targetValue = fixtures.reduce((sum, f) => sum + f.posX, 0) / fixtures.length;
      fixtures.forEach(f => newPositions.set(f._stableId, [targetValue, f.posY, f.posZ]));
    } else if (alignment === 'right') {
      targetValue = Math.max(...fixtures.map(f => f.posX));
      fixtures.forEach(f => newPositions.set(f._stableId, [targetValue, f.posY, f.posZ]));
    } else if (alignment === 'top') {
      targetValue = Math.max(...fixtures.map(f => f.posY));
      fixtures.forEach(f => newPositions.set(f._stableId, [f.posX, targetValue, f.posZ]));
    } else if (alignment === 'center-v') {
      targetValue = fixtures.reduce((sum, f) => sum + f.posY, 0) / fixtures.length;
      fixtures.forEach(f => newPositions.set(f._stableId, [f.posX, targetValue, f.posZ]));
    } else if (alignment === 'bottom') {
      targetValue = Math.min(...fixtures.map(f => f.posY));
      fixtures.forEach(f => newPositions.set(f._stableId, [f.posX, targetValue, f.posZ]));
    }

    type AlignSnapshot = {
      stableId: string;
      prevX: number; prevY: number; prevZ: number;
      prevWasMoved?: boolean;
      prevOrigX?: number; prevOrigY?: number; prevOrigZ?: number;
    };

    const snapshots: AlignSnapshot[] = fixtures.map(f => {
      const cur = findFixtureById(locationDataRef.current!, f._stableId) ?? f;
      return {
        stableId: f._stableId,
        prevX: cur.posX, prevY: cur.posY, prevZ: cur.posZ,
        prevWasMoved: cur.wasMoved,
        prevOrigX: cur.originalPosX, prevOrigY: cur.originalPosY, prevOrigZ: cur.originalPosZ,
      };
    });

    const prevMap = new Map(snapshots.map(s => [s.stableId, s]));

    executeCommand({
      commandName: 'AlignFixtures',
      do() {
        setLocationData(prev => prev.map(loc => {
          if (!loc._stableId || !newPositions.has(loc._stableId)) return loc;
          const [newX, newY, newZ] = newPositions.get(loc._stableId)!;
          const snap = prevMap.get(loc._stableId)!;
          return {
            ...loc,
            posX: newX, posY: newY, posZ: newZ,
            wasMoved: true,
            originalPosX: loc.originalPosX ?? snap.prevX,
            originalPosY: loc.originalPosY ?? snap.prevY,
            originalPosZ: loc.originalPosZ ?? snap.prevZ,
          };
        }));
      },
      undo() {
        setLocationData(prev => prev.map(loc => {
          if (!loc._stableId) return loc;
          const saved = prevMap.get(loc._stableId);
          if (!saved) return loc;
          return {
            ...loc,
            posX: saved.prevX, posY: saved.prevY, posZ: saved.prevZ,
            wasMoved: saved.prevWasMoved,
            originalPosX: saved.prevOrigX,
            originalPosY: saved.prevOrigY,
            originalPosZ: saved.prevOrigZ,
          };
        }));
      },
    });
  }, [setLocationData, executeCommand, locationDataRef]);

  return {
    // State
    modifiedFloorPlates,
    deletedFixtures,
    deletedFixturePositions,
    deleteConfirmationOpen,
    fixturesToDelete,

    // Setters (for external use)
    setModifiedFloorPlates,
    setDeleteConfirmationOpen,

    // Handlers
    handlePositionChange,
    handleRotateFixture,
    handleMultiRotateFixture,
    handleMultiPositionChange,
    handleResetPosition,
    handleResetMultiplePositions,
    handleBrandChange,
    handleFixtureBrandChange,
    handleFixtureCountChange,
    handleFixtureCountChangeMulti,
    handleFixtureHierarchyChange,
    handleDuplicateFixture,
    handleDeleteFixture,
    handleDeleteFixtures,
    handleConfirmDelete,
    handleSplitFixture,
    canMergeFixtures,
    handleMergeFixtures,
    handleAlignFixtures,
  };
}
