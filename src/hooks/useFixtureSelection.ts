import { useState, useCallback } from 'react';

export interface LocationData {
  // Stable identity — assigned once on load or creation, never changes
  _stableId: string;

  // Current state (what's displayed and used)
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
  brand: string;
  count: number;
  hierarchy: number;
  glbUrl?: string;
  variant?: string; // Variant name for fixtures with variants (e.g., podium display)
  fixtureId?: string; // Assigned during Make Live process

  // Original state (from CSV ingestion, for reset and export logic)
  originalBlockName?: string;
  originalPosX?: number;
  originalPosY?: number;
  originalPosZ?: number;
  originalRotationX?: number;
  originalRotationY?: number;
  originalRotationZ?: number;
  originalBrand?: string;
  originalCount?: number;
  originalHierarchy?: number;
  originalGlbUrl?: string;
  originalFixtureId?: string;

  // Modification tracking
  wasMoved?: boolean;
  wasRotated?: boolean;
  wasTypeChanged?: boolean;
  wasBrandChanged?: boolean;
  wasCountChanged?: boolean;
  wasHierarchyChanged?: boolean;
  wasDuplicated?: boolean;
  wasSplit?: boolean;
  wasMerged?: boolean;

  // Deletion tracking (for fixtures that should not render or export)
  // Set to true when a fixture is split or type-changed (original gets marked for deletion)
  forDelete?: boolean;

  // Internal tracking
  _updateTimestamp?: number;
  _ingestionTimestamp?: number;
}

export function generateFixtureUID(location: LocationData): string {
  const timestamp = location._ingestionTimestamp || location._updateTimestamp || Date.now();
  return `${location.blockName}-${location.posX.toFixed(3)}-${location.posY.toFixed(3)}-${location.posZ.toFixed(3)}-${timestamp}`;
}

export function generateOriginalUID(location: LocationData): string {
  // Use original position and ingestion timestamp for CSV matching
  // This ensures moved fixtures can be matched back to their original CSV rows
  const originalPosX = location.originalPosX ?? location.posX;
  const originalPosY = location.originalPosY ?? location.posY;
  const originalPosZ = location.originalPosZ ?? location.posZ;
  const originalBlockName = location.originalBlockName ?? location.blockName;
  const timestamp = location._ingestionTimestamp || location._updateTimestamp || Date.now();

  return `${originalBlockName}-${originalPosX.toFixed(3)}-${originalPosY.toFixed(3)}-${originalPosZ.toFixed(3)}-${timestamp}`;
}

export function useFixtureSelection(editFloorplatesMode: boolean = false) {
  // ID-based selection state — derived LocationData objects computed via useMemo in parent
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);

  const handleFixtureClick = useCallback((clickedLocation: LocationData, event?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) => {
    if (editFloorplatesMode) return;
    const isMultiSelect = event?.shiftKey || event?.metaKey || event?.ctrlKey;
    const clickedId = clickedLocation._stableId;
    if (!clickedId) return;

    if (isMultiSelect) {
      setSelectedLocationIds(prev => {
        // Include current single selection if transitioning from single to multi
        const currentIds = prev.length === 0 && selectedLocationId ? [selectedLocationId] : prev;
        if (currentIds.includes(clickedId)) {
          return currentIds.filter(id => id !== clickedId);
        } else {
          return [...currentIds, clickedId];
        }
      });
      setSelectedLocationId(null);
    } else {
      setSelectedLocationId(clickedId);
      setSelectedLocationIds([clickedId]);
    }
  }, [editFloorplatesMode, selectedLocationId]);

  // Check if a location is selected by _stableId
  const isLocationSelected = useCallback((location: LocationData) => {
    return location._stableId ? selectedLocationIds.includes(location._stableId) : false;
  }, [selectedLocationIds]);

  // Clear all selections
  const clearSelections = useCallback(() => {
    setSelectedLocationId(null);
    setSelectedLocationIds([]);
  }, []);

  return {
    selectedLocationId,
    selectedLocationIds,
    setSelectedLocationId,
    setSelectedLocationIds,
    handleFixtureClick,
    isLocationSelected,
    clearSelections,
  };
}
