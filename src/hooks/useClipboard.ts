import { useState, useCallback, useEffect } from 'react';
import type { LocationData } from './useFixtureSelection';

const CLIPBOARD_KEY = 'dg2n-layout3d-clipboard';

// Clipboard data types - simplified versions without modification flags and IDs
export interface ClipboardFixture {
  // Core position/transform data
  blockName: string;
  floorIndex: number;
  originX?: number; // Origin X for the floor
  originY?: number; // Origin Y for the floor
  posX: number;
  posY: number;
  posZ: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;

  // Properties
  brand: string;
  count: number;
  hierarchy: number;
  glbUrl?: string;
  variant?: string;
}

export interface ClipboardArchObject {
  type: ArchitecturalObjectType;
  variant?: string;
  floorIndex: number;
  customProperties?: Record<string, any>;

  // Single-point data
  posX?: number;
  posY?: number;
  posZ?: number;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
  width?: number;
  height?: number;
  depth?: number;

  // Two-point data
  startPoint?: [number, number, number];
  endPoint?: [number, number, number];
  rotation?: number;
}

export interface ClipboardData {
  version: string;
  timestamp: number;
  sourceStoreId?: string;
  fixtures: ClipboardFixture[];
  architecturalObjects: ClipboardArchObject[];
  metadata: {
    totalItems: number;
    sourceFloors: number[];
    brands: string[];
    fixtureTypes: string[];
  };
}

export interface ClipboardState {
  hasData: boolean;
  itemCount: number;
  fixtureCount: number;
  archObjectCount: number;
}

export type ArchitecturalObjectType =
  | 'glazing'
  | 'partition'
  | 'entrance_door'
  | 'exit_door'
  | 'door'
  | 'window'
  | 'column'
  | 'wall'
  | 'staircase'
  | 'toilet'
  | 'trial_room'
  | 'boh'
  | 'cash_till'
  | 'window_display';

export interface ArchitecturalObject {
  id: string;
  type: ArchitecturalObjectType;
  variant?: string;
  floorIndex: number;
  posX?: number;
  posY?: number;
  posZ?: number;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
  width?: number;
  height?: number;
  depth?: number;
  startPoint?: [number, number, number];
  endPoint?: [number, number, number];
  rotation?: number;
  originalPosX?: number;
  originalPosY?: number;
  originalPosZ?: number;
  originalRotationX?: number;
  originalRotationY?: number;
  originalRotationZ?: number;
  originalWidth?: number;
  originalHeight?: number;
  originalDepth?: number;
  originalStartPoint?: [number, number, number];
  originalEndPoint?: [number, number, number];
  originalRotation?: number;
  wasMoved?: boolean;
  wasRotated?: boolean;
  wasResized?: boolean;
  wasHeightChanged?: boolean;
  customProperties?: Record<string, any>;
}

export interface PasteOptions {
  targetFloorIndex: number;
  floorMapping?: Map<number, number>;
  offsetX?: number;
  offsetY?: number;
  offsetZ?: number;
}

// Serialization helpers
const serializeFixture = (fixture: LocationData): ClipboardFixture => {
  return {
    blockName: fixture.blockName,
    floorIndex: fixture.floorIndex,
    originX: fixture.originX,
    originY: fixture.originY,
    posX: fixture.posX,
    posY: fixture.posY,
    posZ: fixture.posZ,
    rotationX: fixture.rotationX,
    rotationY: fixture.rotationY,
    rotationZ: fixture.rotationZ,
    brand: fixture.brand,
    count: fixture.count,
    hierarchy: fixture.hierarchy,
    glbUrl: fixture.glbUrl,
    variant: fixture.variant,
  };
};

const serializeArchObject = (obj: ArchitecturalObject): ClipboardArchObject => {
  const base = {
    type: obj.type,
    variant: obj.variant,
    floorIndex: obj.floorIndex,
    height: obj.height,
    customProperties: obj.customProperties,
  };

  // Single-point
  if (obj.posX !== undefined) {
    return {
      ...base,
      posX: obj.posX,
      posY: obj.posY,
      posZ: obj.posZ,
      rotationX: obj.rotationX,
      rotationY: obj.rotationY,
      rotationZ: obj.rotationZ,
      width: obj.width,
      depth: obj.depth,
    };
  }

  // Two-point
  return {
    ...base,
    startPoint: obj.startPoint,
    endPoint: obj.endPoint,
    rotation: obj.rotation,
  };
};

// Transform functions for pasting
export const transformFixturesForPaste = (
  clipboardFixtures: ClipboardFixture[],
  options: PasteOptions,
  currentLocationData: LocationData[]
): LocationData[] => {
  const { targetFloorIndex, floorMapping, offsetX = 0, offsetY = 0, offsetZ = 0 } = options;

  // Calculate max hierarchy on target floor
  const targetFloorFixtures = currentLocationData.filter(
    loc => loc.floorIndex === targetFloorIndex && !loc.forDelete
  );
  let maxHierarchy = targetFloorFixtures.length > 0
    ? Math.max(...targetFloorFixtures.map(loc => loc.hierarchy))
    : 0;

  // Get target floor's origin (from any fixture on that floor)
  const targetFloorOriginFixture = targetFloorFixtures[0];
  const targetOriginX = targetFloorOriginFixture?.originX ?? 0;
  const targetOriginY = targetFloorOriginFixture?.originY ?? 0;

  return clipboardFixtures.map((clipFix) => {
    const targetFloor = floorMapping?.get(clipFix.floorIndex) ?? targetFloorIndex;
    maxHierarchy += 1;

    const now = Date.now();
    const timestamp = now + Math.random() * 1000;

    // Adjust position based on origin difference
    const sourceOriginX = clipFix.originX ?? 0;
    const sourceOriginY = clipFix.originY ?? 0;
    const originDeltaX = targetOriginX - sourceOriginX;
    const originDeltaY = targetOriginY - sourceOriginY;

    const posX = clipFix.posX + originDeltaX + offsetX;
    const posY = clipFix.posY + originDeltaY + offsetY;
    const posZ = clipFix.posZ + offsetZ;

    return {
      blockName: clipFix.blockName,
      floorIndex: targetFloor,
      originX: targetOriginX,
      originY: targetOriginY,
      posX,
      posY,
      posZ,
      rotationX: clipFix.rotationX,
      rotationY: clipFix.rotationY,
      rotationZ: clipFix.rotationZ,
      brand: clipFix.brand,
      count: clipFix.count,
      hierarchy: maxHierarchy,
      glbUrl: clipFix.glbUrl,
      variant: clipFix.variant,

      // Set originals to pasted position (makes this the "baseline")
      originalBlockName: clipFix.blockName,
      originalPosX: posX,
      originalPosY: posY,
      originalPosZ: posZ,
      originalRotationX: clipFix.rotationX,
      originalRotationY: clipFix.rotationY,
      originalRotationZ: clipFix.rotationZ,
      originalBrand: clipFix.brand,
      originalCount: clipFix.count,
      originalHierarchy: maxHierarchy,
      originalGlbUrl: clipFix.glbUrl,

      // Mark as duplicated (since it's a pasted copy)
      wasDuplicated: true,

      // Reset other modification flags
      wasMoved: false,
      wasRotated: false,
      wasTypeChanged: false,
      wasBrandChanged: false,
      wasCountChanged: false,
      wasHierarchyChanged: false,

      // Generate new timestamps
      _updateTimestamp: timestamp,
      _ingestionTimestamp: timestamp,
    } as LocationData;
  });
};

export const transformArchObjectsForPaste = (
  clipboardObjects: ClipboardArchObject[],
  options: PasteOptions
): ArchitecturalObject[] => {
  const { targetFloorIndex, floorMapping, offsetX = 0, offsetY = 0, offsetZ = 0 } = options;

  return clipboardObjects.map((clipObj) => {
    const targetFloor = floorMapping?.get(clipObj.floorIndex) ?? targetFloorIndex;
    const id = `${clipObj.type}_${targetFloor}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const base = {
      id,
      type: clipObj.type,
      variant: clipObj.variant,
      floorIndex: targetFloor,
      height: clipObj.height,
      customProperties: clipObj.customProperties,
    };

    // Single-point
    if (clipObj.posX !== undefined) {
      const posX = clipObj.posX + offsetX;
      const posY = clipObj.posY! + offsetY;
      const posZ = clipObj.posZ! + offsetZ;

      return {
        ...base,
        posX,
        posY,
        posZ,
        rotationX: clipObj.rotationX,
        rotationY: clipObj.rotationY,
        rotationZ: clipObj.rotationZ,
        width: clipObj.width,
        depth: clipObj.depth,

        // Set originals
        originalPosX: posX,
        originalPosY: posY,
        originalPosZ: posZ,
        originalRotationX: clipObj.rotationX,
        originalRotationY: clipObj.rotationY,
        originalRotationZ: clipObj.rotationZ,
        originalWidth: clipObj.width,
        originalHeight: clipObj.height,
        originalDepth: clipObj.depth,

        // Mark as duplicated
        wasMoved: false,
        wasRotated: false,
        wasResized: false,
        wasHeightChanged: false,
      } as ArchitecturalObject;
    }

    // Two-point
    const startPoint: [number, number, number] = [
      clipObj.startPoint![0] + offsetX,
      clipObj.startPoint![1] + offsetY,
      clipObj.startPoint![2] + offsetZ,
    ];
    const endPoint: [number, number, number] = [
      clipObj.endPoint![0] + offsetX,
      clipObj.endPoint![1] + offsetY,
      clipObj.endPoint![2] + offsetZ,
    ];

    return {
      ...base,
      startPoint,
      endPoint,
      rotation: clipObj.rotation,

      // Set originals
      originalStartPoint: [...startPoint] as [number, number, number],
      originalEndPoint: [...endPoint] as [number, number, number],
      originalRotation: clipObj.rotation,

      // Mark as duplicated
      wasMoved: false,
      wasRotated: false,
      wasResized: false,
      wasHeightChanged: false,
    } as ArchitecturalObject;
  });
};

export function useClipboard() {
  const [clipboardState, setClipboardState] = useState<ClipboardState>({
    hasData: false,
    itemCount: 0,
    fixtureCount: 0,
    archObjectCount: 0,
  });

  // Check clipboard and update state
  const checkClipboard = useCallback(() => {
    try {
      const storedData = localStorage.getItem(CLIPBOARD_KEY);
      if (!storedData) {
        setClipboardState({
          hasData: false,
          itemCount: 0,
          fixtureCount: 0,
          archObjectCount: 0,
        });
        return;
      }

      const data: ClipboardData = JSON.parse(storedData);
      const fixtureCount = data.fixtures.length;
      const archObjectCount = data.architecturalObjects.length;

      setClipboardState({
        hasData: true,
        itemCount: fixtureCount + archObjectCount,
        fixtureCount,
        archObjectCount,
      });
    } catch (error) {
      console.error('[useClipboard] Error checking clipboard:', error);
      // Clear corrupted data
      localStorage.removeItem(CLIPBOARD_KEY);
      setClipboardState({
        hasData: false,
        itemCount: 0,
        fixtureCount: 0,
        archObjectCount: 0,
      });
    }
  }, []);

  // Listen for storage events (multi-tab sync)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === CLIPBOARD_KEY) {
        checkClipboard();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [checkClipboard]);

  // Copy fixtures only
  const copyFixtures = useCallback((fixtures: LocationData[], sourceStoreId?: string) => {
    try {
      const clipboardFixtures = fixtures.map(serializeFixture);

      // Extract metadata
      const uniqueFloors = [...new Set(fixtures.map(f => f.floorIndex))];
      const uniqueBrands = [...new Set(fixtures.map(f => f.brand))];
      const uniqueTypes = [...new Set(fixtures.map(f => f.blockName))];

      const data: ClipboardData = {
        version: '1.0',
        timestamp: Date.now(),
        sourceStoreId,
        fixtures: clipboardFixtures,
        architecturalObjects: [],
        metadata: {
          totalItems: fixtures.length,
          sourceFloors: uniqueFloors,
          brands: uniqueBrands,
          fixtureTypes: uniqueTypes,
        },
      };

      localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(data));
      checkClipboard();
      return true;
    } catch (error) {
      console.error('[useClipboard] Error copying fixtures:', error);
      return false;
    }
  }, [checkClipboard]);

  // Copy architectural objects only
  const copyArchObjects = useCallback((objects: ArchitecturalObject[], sourceStoreId?: string) => {
    try {
      const clipboardObjects = objects.map(serializeArchObject);

      // Extract metadata
      const uniqueFloors = [...new Set(objects.map(o => o.floorIndex))];

      const data: ClipboardData = {
        version: '1.0',
        timestamp: Date.now(),
        sourceStoreId,
        fixtures: [],
        architecturalObjects: clipboardObjects,
        metadata: {
          totalItems: objects.length,
          sourceFloors: uniqueFloors,
          brands: [],
          fixtureTypes: [],
        },
      };

      localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(data));
      checkClipboard();
      return true;
    } catch (error) {
      console.error('[useClipboard] Error copying arch objects:', error);
      return false;
    }
  }, [checkClipboard]);

  // Copy mixed items
  const copyMixed = useCallback((
    fixtures: LocationData[],
    objects: ArchitecturalObject[],
    sourceStoreId?: string
  ) => {
    try {
      const clipboardFixtures = fixtures.map(serializeFixture);
      const clipboardObjects = objects.map(serializeArchObject);

      // Extract metadata
      const uniqueFloors = [...new Set([
        ...fixtures.map(f => f.floorIndex),
        ...objects.map(o => o.floorIndex),
      ])];
      const uniqueBrands = [...new Set(fixtures.map(f => f.brand))];
      const uniqueTypes = [...new Set(fixtures.map(f => f.blockName))];

      const data: ClipboardData = {
        version: '1.0',
        timestamp: Date.now(),
        sourceStoreId,
        fixtures: clipboardFixtures,
        architecturalObjects: clipboardObjects,
        metadata: {
          totalItems: fixtures.length + objects.length,
          sourceFloors: uniqueFloors,
          brands: uniqueBrands,
          fixtureTypes: uniqueTypes,
        },
      };

      localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(data));
      checkClipboard();
      return true;
    } catch (error) {
      console.error('[useClipboard] Error copying mixed items:', error);
      return false;
    }
  }, [checkClipboard]);

  // Get clipboard data
  const getClipboardData = useCallback((): ClipboardData | null => {
    try {
      const storedData = localStorage.getItem(CLIPBOARD_KEY);
      if (!storedData) {
        return null;
      }

      const data: ClipboardData = JSON.parse(storedData);
      return data;
    } catch (error) {
      console.error('[useClipboard] Error getting clipboard data:', error);
      // Clear corrupted data
      localStorage.removeItem(CLIPBOARD_KEY);
      checkClipboard();
      return null;
    }
  }, [checkClipboard]);

  // Clear clipboard
  const clearClipboard = useCallback(() => {
    localStorage.removeItem(CLIPBOARD_KEY);
    setClipboardState({
      hasData: false,
      itemCount: 0,
      fixtureCount: 0,
      archObjectCount: 0,
    });
  }, []);

  return {
    clipboardState,
    copyFixtures,
    copyArchObjects,
    copyMixed,
    getClipboardData,
    clearClipboard,
    checkClipboard,
  };
}
