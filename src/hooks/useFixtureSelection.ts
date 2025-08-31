import { useState, useCallback, useEffect } from 'react';

export interface LocationData {
  blockName: string;
  floorIndex: number;
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
  _updateTimestamp?: number;
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
    return selectedLocations.some(loc => 
      loc.blockName === location.blockName &&
      Math.abs(loc.posX - location.posX) < 0.001 &&
      Math.abs(loc.posY - location.posY) < 0.001 &&
      Math.abs(loc.posZ - location.posZ) < 0.001
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