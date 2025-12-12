import { useState, useCallback, useEffect } from 'react';

export interface LocationData {
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
  const [selectedLocation, setSelectedLocation] = useState<LocationData | null>(null);
  const [selectedLocations, setSelectedLocations] = useState<LocationData[]>([]);

  // Handle multi-select functionality
  const handleFixtureClick = useCallback((clickedLocation: LocationData, event?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) => {
    if (editFloorplatesMode) return;
    const isMultiSelect = event?.shiftKey || event?.metaKey || event?.ctrlKey;
    
    if (isMultiSelect) {
      setSelectedLocations(prev => {
        // Include current single selection if we're transitioning from single to multi
        const currentSelections = prev.length === 0 && selectedLocation ? [selectedLocation] : prev;
        
        const isAlreadySelected = currentSelections.some(loc => 
          loc.blockName === clickedLocation.blockName &&
          Math.abs(loc.posX - clickedLocation.posX) < 0.001 &&
          Math.abs(loc.posY - clickedLocation.posY) < 0.001 &&
          Math.abs(loc.posZ - clickedLocation.posZ) < 0.001
        );
        
        if (isAlreadySelected) {
          // Remove from selection
          const newSelection = currentSelections.filter(loc => !(loc.blockName === clickedLocation.blockName &&
            Math.abs(loc.posX - clickedLocation.posX) < 0.001 &&
            Math.abs(loc.posY - clickedLocation.posY) < 0.001 &&
            Math.abs(loc.posZ - clickedLocation.posZ) < 0.001));
          
          return newSelection;
        } else {
          // Add to selection
          const newSelection = [...currentSelections, clickedLocation];
          return newSelection;
        }
      });
      
      // Update selectedLocation based on new selection state
      setSelectedLocation(null); // Will be updated by useEffect
    } else {
      // Single select
      setSelectedLocations([clickedLocation]);
      setSelectedLocation(clickedLocation);
    }
  }, [editFloorplatesMode, selectedLocation]);

  // Check if a location is selected (check selectedLocations array as single source of truth)
  const isLocationSelected = useCallback((location: LocationData) => {
    const locationUID = generateFixtureUID(location);
    return selectedLocations.some(loc => 
      generateFixtureUID(loc) === locationUID
    );
  }, [selectedLocations]);

  // Clear all selections
  const clearSelections = useCallback(() => {
    setSelectedLocation(null);
    setSelectedLocations([]);
  }, []);
  
  // Sync selectedLocation with selectedLocations array
  useEffect(() => {
    if (selectedLocations.length === 1) {
      setSelectedLocation(selectedLocations[0]);
    } else if (selectedLocations.length > 1) {
      setSelectedLocation(null);
    } else {
      setSelectedLocation(null);
    }
  }, [selectedLocations]);

  return {
    selectedLocation,
    selectedLocations,
    setSelectedLocation,
    setSelectedLocations,
    handleFixtureClick,
    isLocationSelected,
    clearSelections,
  };
}