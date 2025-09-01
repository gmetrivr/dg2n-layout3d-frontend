import { useState, useCallback } from 'react';
import { type LocationData, generateFixtureUID } from './useFixtureSelection';

// Legacy interfaces - keeping for backward compatibility but no longer actively used
// All modification data is now embedded directly in LocationData objects
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

export function useFixtureModifications(
  selectedLocation: LocationData | null,
  selectedLocations: LocationData[],
  selectedFloorPlate: any,
  setSelectedLocation: React.Dispatch<React.SetStateAction<LocationData | null>>,
  setSelectedLocations: React.Dispatch<React.SetStateAction<LocationData[]>>,
  setLocationData: React.Dispatch<React.SetStateAction<LocationData[]>>,
  setSelectedFloorPlate: React.Dispatch<React.SetStateAction<any>>
) {
  // All modification tracking is now done via embedded flags in LocationData
  // No more separate Maps needed
  const [modifiedFloorPlates, setModifiedFloorPlates] = useState<Map<string, any>>(new Map());
  const [deletedFixtures, setDeletedFixtures] = useState<Set<string>>(new Set());
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [fixturesToDelete, setFixturesToDelete] = useState<LocationData[]>([]);

  const handlePositionChange = useCallback((location: LocationData, newPosition: [number, number, number]) => {
    // This function is called only when transform ends (from Canvas3D)
    // Single state update to minimize re-renders and preserve transform controls
    const key = generateFixtureUID(location);
    
    // Batch all updates in a single state change to prevent multiple re-renders
    setLocationData(prev => prev.map(loc => {
      if (generateFixtureUID(loc) === key) {
        return {
          ...loc,
          posX: newPosition[0],
          posY: newPosition[1], 
          posZ: newPosition[2],
          wasMoved: true,
          // Preserve original position for reset functionality
          originalPosX: loc.originalPosX ?? loc.posX,
          originalPosY: loc.originalPosY ?? loc.posY,
          originalPosZ: loc.originalPosZ ?? loc.posZ,
        };
      }
      return loc;
    }));

    // Update selectedLocation without triggering re-selection that breaks transform controls
    setSelectedLocation(prev => {
      if (prev && generateFixtureUID(prev) === key) {
        return {
          ...prev,
          posX: newPosition[0],
          posY: newPosition[1],
          posZ: newPosition[2],
          wasMoved: true,
          originalPosX: prev.originalPosX ?? prev.posX,
          originalPosY: prev.originalPosY ?? prev.posY,
          originalPosZ: prev.originalPosZ ?? prev.posZ,
        };
      }
      return prev;
    });
  }, [setLocationData, setSelectedLocation]);


  const handleRotateFixture = useCallback((degrees: number) => {
    if (!selectedLocation) return;
    
    const key = generateFixtureUID(selectedLocation);
    
    // Batch all updates in a single state change to prevent multiple re-renders
    setLocationData(prev => prev.map(loc => {
      const locKey = generateFixtureUID(loc);
      if (locKey === key) {
        // Calculate new rotation
        let newRotationZ = loc.rotationZ + degrees;
        newRotationZ = ((newRotationZ % 360) + 360) % 360;
        
        return {
          ...loc,
          // Update current rotation
          rotationZ: newRotationZ,
          // Set rotation flag and preserve original rotation
          wasRotated: true,
          originalRotationX: loc.originalRotationX ?? loc.rotationX,
          originalRotationY: loc.originalRotationY ?? loc.rotationY,
          originalRotationZ: loc.originalRotationZ ?? loc.rotationZ,
        };
      }
      return loc;
    }));

    // Update selectedLocation without triggering re-selection that breaks transform controls
    setSelectedLocation(prev => {
      if (prev && generateFixtureUID(prev) === key) {
        let newRotationZ = prev.rotationZ + degrees;
        newRotationZ = ((newRotationZ % 360) + 360) % 360;
        
        return {
          ...prev,
          rotationZ: newRotationZ,
          wasRotated: true,
          originalRotationX: prev.originalRotationX ?? prev.rotationX,
          originalRotationY: prev.originalRotationY ?? prev.rotationY,
          originalRotationZ: prev.originalRotationZ ?? prev.rotationZ,
        };
      }
      return prev;
    });
  }, [selectedLocation, setLocationData, setSelectedLocation]);

  const handleMultiRotateFixture = useCallback((degrees: number) => {
    // Update LocationData for all selected fixtures
    setLocationData(prev => prev.map(loc => {
      const isSelected = selectedLocations.some(selectedLoc => 
        generateFixtureUID(selectedLoc) === generateFixtureUID(loc)
      );
      
      if (isSelected) {
        // Calculate new rotation
        let newRotationZ = loc.rotationZ + degrees;
        newRotationZ = ((newRotationZ % 360) + 360) % 360;
        
        return {
          ...loc,
          // Update current rotation
          rotationZ: newRotationZ,
          // Set rotation flag and preserve original rotation
          wasRotated: true,
          originalRotationX: loc.originalRotationX ?? loc.rotationX,
          originalRotationY: loc.originalRotationY ?? loc.rotationY,
          originalRotationZ: loc.originalRotationZ ?? loc.rotationZ,
        };
      }
      return loc;
    }));

    // Update selectedLocations
    setSelectedLocations(prev => prev.map(loc => {
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
  }, [selectedLocations]);

  const handleResetPosition = useCallback((location: LocationData) => {
    // Reset fixture to original values using embedded data
    const resetLocation: LocationData = {
      ...location,
      // Reset position
      posX: location.originalPosX ?? location.posX,
      posY: location.originalPosY ?? location.posY, 
      posZ: location.originalPosZ ?? location.posZ,
      // Reset rotation
      rotationX: location.originalRotationX ?? location.rotationX,
      rotationY: location.originalRotationY ?? location.rotationY,
      rotationZ: location.originalRotationZ ?? location.rotationZ,
      // Reset other properties
      blockName: location.originalBlockName ?? location.blockName,
      brand: location.originalBrand ?? location.brand,
      count: location.originalCount ?? location.count,
      hierarchy: location.originalHierarchy ?? location.hierarchy,
      // Clear modification flags
      wasMoved: false,
      wasRotated: false,
      wasTypeChanged: false,
      wasBrandChanged: false,
      wasCountChanged: false,
      wasHierarchyChanged: false,
    };
    
    // Update location data
    setLocationData(prev => prev.map(loc => 
      generateFixtureUID(loc) === generateFixtureUID(location) ? resetLocation : loc
    ));
    
    setSelectedLocation(null);
    setTimeout(() => setSelectedLocation(resetLocation), 10);
  }, [setSelectedLocation, setLocationData]);

  const handleBrandChange = useCallback((newBrand: string) => {
    if (!selectedFloorPlate) return;
    
    const key = selectedFloorPlate.meshName || `${selectedFloorPlate.surfaceId}-${selectedFloorPlate.brand}`;
    setModifiedFloorPlates(prev => {
      const newMap = new Map(prev);
      newMap.set(key, {
        ...selectedFloorPlate,
        brand: newBrand,
        originalBrand: selectedFloorPlate.originalBrand || selectedFloorPlate.brand
      });
      return newMap;
    });
    
    setSelectedFloorPlate((prev: any) => prev ? { ...prev, brand: newBrand } : null);
  }, [selectedFloorPlate, setSelectedFloorPlate]);

  const handleFixtureBrandChange = useCallback((newBrand: string) => {
    if (selectedLocations.length > 1) {
      // Update selected locations
      setSelectedLocations(prev => prev.map(loc => ({ 
        ...loc, 
        brand: newBrand,
        wasBrandChanged: true,
        originalBrand: loc.originalBrand ?? loc.brand
      })));
      
      // Update location data
      setLocationData(prev => prev.map(loc => {
        const isSelected = selectedLocations.some(selectedLoc => 
          generateFixtureUID(selectedLoc) === generateFixtureUID(loc)
        );
        if (isSelected) {
          return {
            ...loc,
            brand: newBrand,
            wasBrandChanged: true,
            originalBrand: loc.originalBrand ?? loc.brand
          };
        }
        return loc;
      }));
    } else if (selectedLocation) {
      const key = generateFixtureUID(selectedLocation);
      
      setSelectedLocation(prev => prev ? { 
        ...prev, 
        brand: newBrand,
        wasBrandChanged: true,
        originalBrand: prev.originalBrand ?? prev.brand
      } : null);
      
      // Update location data
      setLocationData(prev => prev.map(loc => {
        if (generateFixtureUID(loc) === key) {
          return {
            ...loc,
            brand: newBrand,
            wasBrandChanged: true,
            originalBrand: loc.originalBrand ?? loc.brand
          };
        }
        return loc;
      }));
    }
  }, [selectedLocation, selectedLocations, setSelectedLocation, setSelectedLocations, setLocationData]);

  const handleFixtureCountChange = useCallback((location: LocationData, newCount: number) => {
    const key = generateFixtureUID(location);
    
    setSelectedLocation(prev => prev ? { 
      ...prev, 
      count: newCount,
      wasCountChanged: true,
      originalCount: prev.originalCount ?? prev.count
    } : null);
    
    setLocationData(prev => prev.map(loc => {
      if (generateFixtureUID(loc) === key) {
        return { 
          ...loc, 
          count: newCount,
          wasCountChanged: true,
          originalCount: loc.originalCount ?? loc.count
        };
      }
      return loc;
    }));
  }, [setSelectedLocation, setLocationData]);

  const handleFixtureCountChangeMulti = useCallback((locations: LocationData[], newCount: number) => {
    setSelectedLocations(prev => prev.map(loc => ({ 
      ...loc, 
      count: newCount,
      wasCountChanged: true,
      originalCount: loc.originalCount ?? loc.count
    })));
    
    setLocationData(prev => prev.map(loc => {
      const locationKey = generateFixtureUID(loc);
      const isModified = locations.some(selectedLoc => {
        const selectedKey = generateFixtureUID(selectedLoc);
        return selectedKey === locationKey;
      });
      
      if (isModified) {
        return { 
          ...loc, 
          count: newCount,
          wasCountChanged: true,
          originalCount: loc.originalCount ?? loc.count
        };
      }
      return loc;
    }));
  }, [setSelectedLocations, setLocationData]);

  const handleFixtureHierarchyChange = useCallback((location: LocationData, newHierarchy: number) => {
    const key = generateFixtureUID(location);
    
    setSelectedLocation(prev => prev ? { 
      ...prev, 
      hierarchy: newHierarchy,
      wasHierarchyChanged: true,
      originalHierarchy: prev.originalHierarchy ?? prev.hierarchy
    } : null);
    
    setLocationData(prev => prev.map(loc => {
      if (generateFixtureUID(loc) === key) {
        return { 
          ...loc, 
          hierarchy: newHierarchy,
          wasHierarchyChanged: true,
          originalHierarchy: loc.originalHierarchy ?? loc.hierarchy
        };
      }
      return loc;
    }));
  }, [setSelectedLocation, setLocationData]);

  const handleFixtureHierarchyChangeMulti = useCallback((locations: LocationData[], newHierarchy: number) => {
    setSelectedLocations(prev => prev.map(loc => ({ 
      ...loc, 
      hierarchy: newHierarchy,
      wasHierarchyChanged: true,
      originalHierarchy: loc.originalHierarchy ?? loc.hierarchy
    })));
    
    setLocationData(prev => prev.map(loc => {
      const locationKey = generateFixtureUID(loc);
      const isModified = locations.some(selectedLoc => {
        const selectedKey = generateFixtureUID(selectedLoc);
        return selectedKey === locationKey;
      });
      
      if (isModified) {
        return { 
          ...loc, 
          hierarchy: newHierarchy,
          wasHierarchyChanged: true,
          originalHierarchy: loc.originalHierarchy ?? loc.hierarchy
        };
      }
      return loc;
    }));
  }, [setSelectedLocations, setLocationData]);

  const handleDuplicateFixture = useCallback((location: LocationData) => {
    // Create duplicate with current position/properties (all modifications are embedded in location object)
    const duplicatedFixture: LocationData = {
      ...location,
      // Use current position (current position includes any moves)
      posX: location.posX,  // Duplicate in place
      posY: location.posY,
      posZ: location.posZ,
      // Keep current blockName, rotation, brand, count, hierarchy (includes all modifications)
      // Reset modification flags since this is a "new" fixture
      wasMoved: false, // Will be set to true if the duplicate is moved later
      wasRotated: false,
      wasTypeChanged: false,
      wasBrandChanged: false,
      wasCountChanged: false,
      wasHierarchyChanged: false,
      wasDuplicated: true, // Mark as duplicate
      // Preserve original values for reset functionality
      originalPosX: location.posX, // Original position of the source fixture (not the duplicate's position)
      originalPosY: location.posY,
      originalPosZ: location.posZ,
      originalRotationX: location.rotationX,
      originalRotationY: location.rotationY, 
      originalRotationZ: location.rotationZ,
      originalBlockName: location.blockName,
      originalBrand: location.brand,
      originalCount: location.count,
      originalHierarchy: location.hierarchy,
      originalGlbUrl: location.glbUrl,
      // Generate new unique timestamps to ensure unique UID even at same position
      _updateTimestamp: Date.now() + Math.random() * 1000, 
      _ingestionTimestamp: Date.now() + Math.random() * 1000 // New unique timestamp for the duplicate
    };
    
    // Add the duplicated fixture to the location data
    // All modifications are already embedded in the duplicatedFixture object
    
    setLocationData(prev => [...prev, duplicatedFixture]);
    setSelectedLocation(duplicatedFixture);
    setSelectedLocations([duplicatedFixture]);
  }, [setLocationData, setSelectedLocation, setSelectedLocations]);

  const handleDeleteFixture = useCallback((location: LocationData) => {
    setFixturesToDelete([location]);
    setDeleteConfirmationOpen(true);
  }, []);

  const handleDeleteFixtures = useCallback((locations: LocationData[]) => {
    setFixturesToDelete(locations);
    setDeleteConfirmationOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    const keysToDelete = new Set<string>();
    
    fixturesToDelete.forEach(location => {
      const key = generateFixtureUID(location);
      keysToDelete.add(key);
    });
    
    setDeletedFixtures(prev => new Set([...prev, ...keysToDelete]));
    
    setSelectedLocation(null);
    setSelectedLocations([]);
    
    setDeleteConfirmationOpen(false);
    setFixturesToDelete([]);
  }, [fixturesToDelete, setSelectedLocation, setSelectedLocations]);

  return {
    // State  
    modifiedFloorPlates,
    deletedFixtures,
    deleteConfirmationOpen,
    fixturesToDelete,
    
    // Setters (for external use)
    setModifiedFloorPlates,
    setDeleteConfirmationOpen,
    
    // Handlers
    handlePositionChange,
    handleRotateFixture,
    handleMultiRotateFixture,
    handleResetPosition,
    handleBrandChange,
    handleFixtureBrandChange,
    handleFixtureCountChange,
    handleFixtureCountChangeMulti,
    handleFixtureHierarchyChange,
    handleFixtureHierarchyChangeMulti,
    handleDuplicateFixture,
    handleDeleteFixture,
    handleDeleteFixtures,
    handleConfirmDelete,
  };
}